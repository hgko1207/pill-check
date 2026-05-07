# Week 0 HARD GATE 실행 가이드

DESIGN.md의 Week 0 GATE를 실제로 돌리는 절차. 코드 빌드 시작 전 필수.

## 0. 사전 작업 (사용자 직접)

1. **부모님 폰 OS 확인** (Android / iOS) — 한 가지로 결정.
2. **식약처 API 키 신청 — 둘 다.**
   - data.go.kr 활용신청 4건 → 인증키 1개:
     - 식품의약품안전처_의약품 제품 허가정보 (15095677)
     - 식품의약품안전처_**의약품안전사용서비스(DUR)성분정보** (15056780) — 핵심
     - 식품의약품안전처_의약품안전사용서비스(DUR)품목정보 (15059486)
     - 식품의약품안전처_건강기능식품정보 (15056760)
   - 식품안전나라 별도 가입 불필요 (V1)
   - 자세한 절차: [../../docs/api-key-guide.md](../../docs/api-key-guide.md)
   - 식품안전나라: https://openapi.foodsafetykorea.go.kr 회원가입 후 인증키 발급
   - 승인까지 보통 1~5 영업일. **그 사이 다른 일 하세요.**
3. 키 도착 알림 받으면 다음 단계로.

## 1. 환경 셋업 (5분)

```bash
cd scripts/week0
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env  # Windows
# cp .env.example .env  # macOS/Linux
```

`.env` 파일 열어서 `NEDRUG_API_KEY` 채우기.

## 2. 검증 실행

```bash
python validate_dur.py
```

3가지 알려진 페어에 대해 식약처 API를 호출해서 매칭 가능성을 확인합니다.

## 3. 결과 해석

스크립트는 다음 중 하나로 종료합니다:

- **`PASS`** → DUR 매칭 ≥ 1건 발견. Week 1 빌드 진행. (단, ship-time 매칭률 40%는 Week 3-4 별도 검증)
- **`FAIL_AUTH_OR_API`** → 의약품 검색조차 0건. API 키 활용신청 승인 여부·엔드포인트 재확인 후 재시도.
- **`FAIL_DATA`** → 의약품은 되지만 DUR 영양제 매칭 0건. **Approach A 폐기 신호 — Approach C(LLM 보조 챗) 피벗 검토.**

`gate_result.json` 파일에 상세 결과 저장됩니다 — 부모님께 보여드릴 때 참고용.

## 4. 다음

- PASS → 부모님 OS 알려주시면 Week 1 모바일 스캐폴드 진행
- FAIL_DATA → DESIGN.md의 Approach C 섹션 다시 검토하고 office-hours 또는 plan-eng-review 한 번 더

## 주의

- 식약처 OpenAPI는 응답 형식(JSON/XML)과 파라미터 이름이 활용신청 후 안내되는 문서 기준입니다. 본 스크립트는 일반 패턴으로 작성됐고, 키 발급 후 실제 응답 구조에 따라 미세 조정이 필요할 수 있습니다.
- 응답이 XML이면 스크립트가 `[JSON 파싱 실패]` 메시지를 출력합니다 — 그 경우 활용신청 시 받은 안내문서를 보고 `&type=json` 파라미터 또는 다른 엔드포인트 변형을 시도하세요.
- 일일 호출 제한이 있으니 디버깅 시 페어 수를 줄이세요.
