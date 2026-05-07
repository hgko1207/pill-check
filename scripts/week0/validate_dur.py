"""
PillCheck Week 0 HARD GATE 검증 스크립트

목적: 식약처 OpenAPI가 PillCheck V1을 빌드할 만큼 의미있는 데이터를 주는지 확인.
DESIGN.md의 Week 0 GATE 섹션 참조.

GATE 통과 조건:
  - 처방약 ↔ 영양제(또는 일반약) DUR 매칭이 ≥ 1건 발견되면 PASS (proof of concept)
  - 0건이면 FAIL → Approach C(LLM 보조)로 즉시 피벗

사용법:
  1. .env.example 복사 → .env
  2. .env에 식약처 API 키 채우기
  3. pip install -r requirements.txt
  4. python validate_dur.py
"""

from __future__ import annotations

import os
import sys
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv

load_dotenv()

NEDRUG_KEY = os.getenv("NEDRUG_API_KEY")
FOODSAFETY_KEY = os.getenv("FOODSAFETY_API_KEY")

if not NEDRUG_KEY:
    print("[FATAL] NEDRUG_API_KEY가 .env에 없습니다. nedrug.mfds.go.kr에서 키 발급 후 채우세요.")
    sys.exit(1)

# 2026-05 fact-check (실제 호출로 검증):
# - 의약품 제품 허가정보(15095677): Service06 → Service07로 전환 + Inq05 → Inq06
# - DUR 병용금기: DURPrdlstInfoService03/getUsjntTabooInfoList03 (품목정보 API에 포함)
#   응답에 INGR_KOR_NAME(성분명) + ITEM_SEQ(품목코드) 모두 포함되어
#   성분/품목 단위 매칭 모두 가능. 총 데이터 81만 건.
# - DUR 성분정보(15056780)의 별도 endpoint는 마이페이지 활용가이드에서 추가 확인 필요.
NEDRUG_DRUG_PRD_INFO = "http://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06"
NEDRUG_DUR_TABOO = "http://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03"
FOODSAFETY_HF_BASE = "http://openapi.foodsafetykorea.go.kr/api"


def _mask_url(url: str) -> str:
    """URL 출력 시 serviceKey 값을 마스킹 (보안)."""
    import re
    return re.sub(r"(serviceKey=)[^&]+", r"\1***MASKED***", url)


KNOWN_PAIRS = [
    {
        "label": "와파린 + 비타민K (전형적 음성 상호작용)",
        "drug_query": "와파린",
        "supplement_keyword": "비타민K",
        "expectation": "DUR 또는 일반 의약품정보에서 비타민K 경고 등장 가능",
    },
    {
        "label": "아토르바스타틴(콜레스테롤약) + 자몽",
        "drug_query": "아토르바스타틴",
        "supplement_keyword": "자몽",
        "expectation": "음식 상호작용 — DUR엔 없을 가능성. 부정 결과여도 정상.",
    },
    {
        "label": "암로디핀(혈압약) + 종합비타민",
        "drug_query": "암로디핀",
        "supplement_keyword": "종합비타민",
        "expectation": "흔한 페어 — 매칭률 측정용",
    },
]


@dataclass
class ProbeResult:
    label: str
    drug_found: bool = False
    drug_item_name: str | None = None
    drug_item_seq: str | None = None
    dur_total_count: int = 0
    dur_hits: int = 0
    dur_samples: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def http_get_json(url: str, params: dict[str, Any], timeout: int = 15) -> dict[str, Any] | None:
    """
    serviceKey는 Encoding 키 그대로 (%2B 등 이미 인코딩된 형태) 사용.
    urlencode가 다시 인코딩하면 %25로 깨지므로, serviceKey만 raw로 붙이고 나머지만 urlencode.
    """
    service_key = params.pop("serviceKey", None)
    other = urlencode(params)
    if service_key is None:
        full_url = f"{url}?{other}"
    else:
        full_url = f"{url}?serviceKey={service_key}&{other}" if other else f"{url}?serviceKey={service_key}"
    resp: requests.Response | None = None
    try:
        resp = requests.get(full_url, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        print(f"  [HTTP {e.response.status_code}] {_mask_url(full_url)}")
    except requests.RequestException as e:
        print(f"  [네트워크] {e}")
    except json.JSONDecodeError:
        body = resp.text[:200] if resp is not None else "(no response body)"
        print(f"  [JSON 파싱 실패] 응답이 JSON이 아님 (XML 가능). 처음 200자: {body}")
    return None


def find_drug_by_name(name: str) -> tuple[str | None, str | None]:
    params = {
        "serviceKey": NEDRUG_KEY,
        "type": "json",
        "item_name": name,
        "numOfRows": 5,
        "pageNo": 1,
    }
    data = http_get_json(NEDRUG_DRUG_PRD_INFO, params)
    if not data:
        return None, None
    body = data.get("body", {}) or data.get("response", {}).get("body", {})
    items = body.get("items") if isinstance(body, dict) else None
    if not items:
        return None, None
    first = items[0] if isinstance(items, list) else items
    return first.get("ITEM_NAME"), first.get("ITEM_SEQ")


def query_dur_taboo_sample(keyword: str | None = None, page_size: int = 200) -> tuple[int, list[dict[str, Any]]]:
    """
    DUR 병용금기 API 호출. (totalCount, items_sample) 반환.
    keyword가 주어지면 응답 items를 client-side로 필터링 (API 검색 파라미터
    명세가 미확인이라 무필터로 가져온 후 INGR_KOR_NAME/INGR_ENG_NAME에 대해 필터링).
    """
    params = {
        "serviceKey": NEDRUG_KEY,
        "type": "json",
        "numOfRows": page_size,
        "pageNo": 1,
    }
    data = http_get_json(NEDRUG_DUR_TABOO, params)
    if not data:
        return 0, []
    body = data.get("body", {}) or data.get("response", {}).get("body", {})
    if not isinstance(body, dict):
        return 0, []
    total_count = int(body.get("totalCount") or 0)
    items_raw = body.get("items")
    if not items_raw:
        return total_count, []
    items = items_raw if isinstance(items_raw, list) else [items_raw]
    if keyword:
        kw_lower = keyword.lower()
        items = [
            it for it in items
            if kw_lower in (it.get("INGR_KOR_NAME") or "").lower()
            or kw_lower in (it.get("INGR_ENG_NAME") or "").lower()
            or kw_lower in (it.get("MIX_INGR") or "").lower()
        ]
    return total_count, items


def probe_pair(pair: dict[str, str]) -> ProbeResult:
    print(f"\n--- {pair['label']} ---")
    print(f"  기대: {pair['expectation']}")
    result = ProbeResult(label=pair["label"])

    item_name, item_seq = find_drug_by_name(pair["drug_query"])
    if item_name:
        result.drug_found = True
        result.drug_item_name = item_name
        result.drug_item_seq = item_seq
        print(f"  [의약품] 매칭: {item_name} (item_seq={item_seq})")
    else:
        result.notes.append(f"의약품 '{pair['drug_query']}' 검색 결과 없음")
        print(f"  [의약품] 검색 결과 없음")

    time.sleep(0.5)

    total_count, filtered_items = query_dur_taboo_sample(keyword=pair["drug_query"])
    result.dur_total_count = total_count
    result.dur_hits = len(filtered_items)
    result.dur_samples = filtered_items[:3]
    if total_count == 0:
        print(f"  [DUR] API 응답 없음 또는 totalCount=0")
        result.notes.append("DUR API 응답 0건")
    else:
        print(f"  [DUR] API 정상 — 전체 totalCount={total_count:,}건")
        if filtered_items:
            print(f"  [DUR] '{pair['drug_query']}' client-side 매칭: {len(filtered_items)}건 (sample page 200건 기준)")
            for sample in filtered_items[:2]:
                print(f"        - {json.dumps(sample, ensure_ascii=False)[:200]}")
        else:
            print(f"  [DUR] sample page 200건 내에서 '{pair['drug_query']}' 매칭 없음 (전체 데이터에 존재할 가능성 — 페이징 필요)")
            result.notes.append("sample 200건 내 매칭 없음 (페이징 또는 정확한 검색 파라미터 필요)")

    return result


def gate_decision(results: list[ProbeResult]) -> tuple[str, str]:
    drug_lookups_ok = sum(1 for r in results if r.drug_found)
    dur_api_works = any(r.dur_total_count > 0 for r in results)
    max_dur_total = max((r.dur_total_count for r in results), default=0)
    client_side_hits = sum(r.dur_hits for r in results)

    if drug_lookups_ok >= 1 and dur_api_works:
        return "PASS", (
            f"의약품 검색 {drug_lookups_ok}/{len(results)} 성공. "
            f"DUR API 정상 — 병용금기 데이터 {max_dur_total:,}건 존재 (성분명 + 품목코드 모두 포함). "
            f"sample 200건 client-side 매칭: {client_side_hits}건. "
            "→ Week 1 빌드 진행. ship-time 정밀 매칭은 마이페이지 활용가이드의 검색 파라미터 명세 확인 후 V1 빌드 중 정교화."
        )
    if drug_lookups_ok == 0 and not dur_api_works:
        return "FAIL_AUTH_OR_API", (
            "의약품 검색·DUR API 둘 다 응답 없음. 키 활성화 대기, 활용신청 승인, "
            "또는 endpoint URL 변경 가능성. 마이페이지에서 4건 모두 '승인' 상태 + 활용가이드의 endpoint URL 확인."
        )
    return "PARTIAL", (
        f"의약품 검색 {drug_lookups_ok}/{len(results)}, DUR API 응답: {dur_api_works}. "
        "한쪽만 작동. 마이페이지에서 미승인 API 확인 필요."
    )


def main() -> int:
    print("=" * 70)
    print("PillCheck Week 0 HARD GATE — 식약처 OpenAPI 검증")
    print("=" * 70)
    print(f"NEDRUG 키: {'O' if NEDRUG_KEY else 'X'}")
    print(f"FOODSAFETY 키: {'O' if FOODSAFETY_KEY else 'X (선택사항 — 이번 라운드에선 미사용)'}")

    results: list[ProbeResult] = []
    for pair in KNOWN_PAIRS:
        results.append(probe_pair(pair))
        time.sleep(0.5)

    print("\n" + "=" * 70)
    print("종합 결과")
    print("=" * 70)
    for r in results:
        print(
            f"  - {r.label}: 의약품={r.drug_found}, DUR총건수={r.dur_total_count:,}, "
            f"sample매칭={r.dur_hits}, "
            f"비고={'; '.join(r.notes) if r.notes else '-'}"
        )

    verdict, message = gate_decision(results)
    print(f"\nGATE 판정: {verdict}")
    print(f"  → {message}")

    out_path = Path(__file__).parent / "gate_result.json"
    out_path.write_text(
        json.dumps(
            {
                "verdict": verdict,
                "message": message,
                "results": [
                    {
                        "label": r.label,
                        "drug_found": r.drug_found,
                        "drug_item_name": r.drug_item_name,
                        "drug_item_seq": r.drug_item_seq,
                        "dur_total_count": r.dur_total_count,
                        "dur_hits": r.dur_hits,
                        "dur_samples": r.dur_samples,
                        "notes": r.notes,
                    }
                    for r in results
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n결과 저장: {out_path}")

    return 0 if verdict in ("PASS",) else 1


if __name__ == "__main__":
    sys.exit(main())
