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

NEDRUG_DRUG_PRD_INFO = "http://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05"
NEDRUG_DUR_INGR = "http://apis.data.go.kr/1471000/DURIrdntInfoService03/getUsjntTabooInfoList03"
FOODSAFETY_HF_BASE = "http://openapi.foodsafetykorea.go.kr/api"

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
        print(f"  [HTTP {e.response.status_code}] {e}")
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


def query_dur_for_ingredient(ingredient_keyword: str) -> list[dict[str, Any]]:
    params = {
        "serviceKey": NEDRUG_KEY,
        "type": "json",
        "ingrKorName": ingredient_keyword,
        "numOfRows": 10,
        "pageNo": 1,
    }
    data = http_get_json(NEDRUG_DUR_INGR, params)
    if not data:
        return []
    body = data.get("body", {}) or data.get("response", {}).get("body", {})
    items = body.get("items") if isinstance(body, dict) else None
    if not items:
        return []
    return items if isinstance(items, list) else [items]


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

    dur_items = query_dur_for_ingredient(pair["drug_query"])
    if dur_items:
        related = [
            it for it in dur_items
            if pair["supplement_keyword"] in json.dumps(it, ensure_ascii=False)
        ]
        result.dur_hits = len(related)
        result.dur_samples = related[:3]
        if related:
            print(f"  [DUR] {pair['supplement_keyword']} 관련 매칭: {len(related)}건 (샘플 3건만 표시)")
            for sample in result.dur_samples:
                print(f"        - {json.dumps(sample, ensure_ascii=False)[:200]}")
        else:
            print(f"  [DUR] '{pair['drug_query']}' DUR {len(dur_items)}건 있으나 '{pair['supplement_keyword']}' 키워드 매칭 없음")
            result.notes.append(f"DUR 데이터 있으나 영양제 키워드 매칭 없음")
    else:
        print(f"  [DUR] '{pair['drug_query']}' 관련 DUR 데이터 0건")
        result.notes.append("DUR 데이터 0건")

    return result


def gate_decision(results: list[ProbeResult]) -> tuple[str, str]:
    total_hits = sum(r.dur_hits for r in results)
    drug_lookups_ok = sum(1 for r in results if r.drug_found)

    if total_hits >= 1:
        return "PASS", (
            f"DUR 매칭 {total_hits}건 발견 (proof of concept). "
            f"의약품 검색은 {drug_lookups_ok}/{len(results)} 성공. "
            "→ Week 1 빌드 진행. ship-time 매칭률(40%)은 Week 3-4에 별도 측정."
        )
    if drug_lookups_ok == 0:
        return "FAIL_AUTH_OR_API", (
            "의약품 검색조차 0건. API 키 또는 엔드포인트 문제 가능성 높음. "
            "키 활용신청 승인 여부, 엔드포인트 URL, 파라미터 다시 확인."
        )
    return "FAIL_DATA", (
        "의약품 검색은 되지만 DUR ↔ 영양제 매칭 0건. "
        "→ Approach A 폐기 신호. DESIGN.md의 Approach C(LLM 보조) 검토."
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
            f"  - {r.label}: 의약품={r.drug_found}, DUR매칭={r.dur_hits}, "
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

    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
