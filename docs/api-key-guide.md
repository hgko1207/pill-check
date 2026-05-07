# 식약처 OpenAPI 키 발급 가이드

> ✅ Fact-checked (2026-05): 모든 데이터셋 ID와 URL을 공공데이터포털에서 직접 확인.

PillCheck V1은 **공공데이터포털(data.go.kr) 한 곳**에서 활용신청 4건을 합니다.
**인증키는 1개**로 끝 (data.go.kr 회원당 인증키 1개로 모든 활용신청 API 호출).

> 💡 **식품안전나라(foodsafetykorea.go.kr) 별도 가입 안 해도 됩니다.** 건강기능식품 정보도 data.go.kr에서 받을 수 있습니다. 식품안전나라는 추가 데이터가 필요한 V1.5+에서나 검토.

---

## V1에 필요한 4개 데이터셋 (모두 data.go.kr)

| # | 정확한 이름 (data.go.kr 표시 그대로) | ID | URL | PillCheck 우선순위 |
|---|---|---|---|---|
| 1 | 식품의약품안전처_의약품 제품 허가정보 | 15095677 | https://www.data.go.kr/data/15095677/openapi.do | 필수 (약 검색·등록) |
| 2 | 식품의약품안전처_**의약품안전사용서비스(DUR)성분정보** | 15056780 | https://www.data.go.kr/data/15056780/openapi.do | **필수 (앱의 핵심)** |
| 3 | 식품의약품안전처_의약품안전사용서비스(DUR)품목정보 | 15059486 | https://www.data.go.kr/data/15059486/openapi.do | 권장 (보조 매칭) |
| 4 | 식품의약품안전처_건강기능식품정보 | 15056760 | https://www.data.go.kr/data/15056760/openapi.do | 필수 (영양제 마스터) |

**합계: 활용신청 4건 → 인증키 1개**

> ⚠️ **왜 DUR 성분정보가 핵심**: PillCheck wedge는 "처방약 + 영양제 상호작용". 영양제(건강기능식품)는 식약처 의약품 코드가 없어 **품목 단위 매칭 불가**. 반드시 **성분 단위**로 매칭해야 합니다 (와파린 ↔ 비타민K 등).

> 📝 **활용신청 안 해도 되는 것**: data.go.kr에서 "DUR" 검색 시 위쪽에 보이는 `한국의약품안전관리원_연령금기/임부금기약물/노인주의약물` CSV 파일들은 **단일 약물 주의사항** (이 약은 노인 주의 등). PillCheck wedge인 **병용 상호작용**과 다른 데이터입니다. V1에 안 씁니다.

---

## 1️⃣ 공공데이터포털 (data.go.kr) — 한 곳에서 전부

### 1-1. 회원가입

1. https://www.data.go.kr 접속
2. 우측 상단 **회원가입** → 일반회원
3. 이메일/휴대폰 인증 (휴대폰 본인인증 1회 필요)
4. 가입 완료 → 로그인

### 1-2. 활용신청 4건 (각각 동일 절차)

위 표의 4개 URL을 순서대로 열어서 각 페이지의 **활용신청** 버튼 클릭. 각 페이지에서:

1. 페이지 우측 또는 하단의 **"활용신청"** 버튼
2. 활용신청 폼:

| 항목 | 입력값 |
|---|---|
| 활용목적 선택 | "앱개발(웹·모바일)" 또는 "기타" |
| 시스템유형 | **일반** |
| 활용목적 (자유 텍스트) | `개인 학습 및 가족용 영양제·일반의약품 상호작용 체크 PWA 프로토타입 개발. 식약처 의약품 마스터·DUR·건강기능식품 데이터를 사용하여 부모님이 복용 중인 약과 신규 구매 영양제의 상호작용을 확인하는 도구.` |
| 라이선스 표시 동의 | ✅ 체크 |

3. **신청** 클릭 → 보통 **자동승인** (1분 ~ 1시간, 가끔 1~3영업일)

검색이 어려우면 위 표의 URL을 직접 주소창에 붙여넣어 페이지로 가는 것이 가장 빠릅니다.

### 1-3. 인증키 확인 (4건 모두 승인 후)

1. 우측 상단 **마이페이지** 클릭
2. 좌측 메뉴 **"오픈API"** → **"개발계정"**
3. 신청한 4개 API가 목록에 표시됨. 상태가 모두 **"승인"** 인지 확인
4. 아무 API 이름 클릭 → 상세 페이지 진입
5. 상단의 **"일반 인증키 (Encoding)"** 옆 키를 **그대로 복사**
   - 예: `kJ1aB%2BcD3eFgH4iJkLmNopq...`

> ⚠️ **Encoding 키 사용** — Decoding 키 X. PillCheck 코드는 Encoding 키 (`%`, `+` 등 그대로) 기준.

> 💡 **4개 API 모두 같은 인증키 하나로 작동.** 어느 API 상세 페이지에서 키를 복사해도 같은 값.

### 1-4. 키 동작 sanity check (1분)

브라우저 주소창에 붙여넣기 (`{KEY}` 자리에 본인 Encoding 키 그대로):

```
http://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06?serviceKey={KEY}&type=json&item_name=타이레놀&numOfRows=1
```

> ✅ **2026-05 fact-checked**: 위 endpoint(`Service07/Inq06`)와 DUR endpoint(`DURPrdlstInfoService03/getUsjntTabooInfoList03`)는 실제 호출로 검증됨. 단 검색 파라미터 명세는 마이페이지 활용가이드에서 ground truth 확인 권장.

**기대 결과:** JSON이 뜨고 타이레놀 제품 1건 보임.

**문제별 진단:**

| 보이는 것 | 원인 | 대응 |
|---|---|---|
| JSON + 타이레놀 정보 | ✅ 정상 | 다음 단계 |
| `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` | 키 활성화 안 됨 또는 해당 API 활용신청 안 함 | 5분~1시간 대기. 또는 마이페이지에서 "의약품 제품 허가정보" 활용신청 승인 여부 확인 |
| `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR` | 일일 한도 초과 | 다음 날 재시도 |
| XML 응답 (JSON 아님) | endpoint URL 변경 가능성 | 마이페이지 → 활용가이드 endpoint 확인 |
| HTTP 404 | endpoint 경로 변경 | 위 동일 |

---

## 2️⃣ (선택) 식품안전나라 별도 OpenAPI

> 💡 **V1에선 건너뛰세요.** data.go.kr만으로 PillCheck V1은 충분합니다.

식품안전나라 자체 포털(https://www.foodsafetykorea.go.kr/api/main.do)은 식약처 산하 자체 OpenAPI를 운영하고, 일부 데이터(영양성분DB 등)는 data.go.kr보다 더 풍부할 수 있습니다. 다만:

- V1엔 불필요 (data.go.kr로 wedge 검증 충분)
- V1.5에서 영양제 성분 단위 정밀 매칭이 필요해질 때 검토
- 식품안전나라는 **별도 회원가입·별도 인증키**

---

## 3️⃣ 발급된 키 PillCheck에 적용

**1개 키**를 두 군데(Python용·웹용)에 같은 값으로 적습니다.

### 3-1. Python 검증 스크립트용 (Week 0 GATE 1)

```powershell
cd d:\project\2026\pill-check\scripts\week0
copy .env.example .env
notepad .env
```

`.env` 파일에:
```
# data.go.kr 인증키 (Encoding) — 4개 API 모두 이 키 하나로 호출
NEDRUG_API_KEY=여기에_data.go.kr_Encoding_키_붙여넣기

# (선택) V1.5에서 식품안전나라 별도 사용 시 채우기. V1엔 비워둬도 OK.
FOODSAFETY_API_KEY=
```

### 3-2. PWA 웹앱용 (Week 1~)

```powershell
cd d:\project\2026\pill-check\web
copy .env.example .env
notepad .env
```

`.env` 파일에 (값은 위 Python용과 **같은 키 그대로**):
```
# data.go.kr 인증키 (Encoding) — 4개 API 모두 이 키 하나로 호출
VITE_NEDRUG_API_KEY=여기에_data.go.kr_Encoding_키_붙여넣기

# (선택) V1.5 식품안전나라용. V1엔 비워둬도 OK.
VITE_FOODSAFETY_API_KEY=
```

> 💡 Python의 `NEDRUG_API_KEY`와 웹의 `VITE_NEDRUG_API_KEY`는 **완전히 같은 값**. Vite는 클라이언트 노출 환경변수에 `VITE_` 접두사를 요구해서 이름만 다를 뿐.

> 두 .env 파일은 모두 `.gitignore`에 의해 git에 안 올라갑니다. **GitHub 노출 위험 없음.**

---

## 흔한 실수 체크리스트

- [ ] **식품안전나라 별도 가입 시도** → V1엔 불필요. data.go.kr 한 곳에서 끝.
- [ ] **Decoding 키 사용** → Encoding 키여야 함
- [ ] 활용목적을 한 단어로 작성 ("테스트") → 가끔 반려. 한 줄 이상 구체적으로
- [ ] 활용신청 즉시 호출 → 인증키 활성화에 5분~1시간 걸릴 수 있음
- [ ] 4건 중 일부만 신청하고 다 됐다고 착각 → 마이페이지에서 4건 모두 "승인" 확인 필수
- [ ] `.env`를 `.env.example`로 만든 뒤 git에 커밋 → **금물.** 항상 `.env`로 (gitignore 적용됨)
- [ ] sanity check URL의 `service06` 버전이 변경됐을 가능성 무시 → 안 되면 마이페이지 활용가이드의 endpoint 사용

---

## 신청 후 대기 동안 할 수 있는 것

키가 도착할 때까지 보통 즉시~5영업일. 그 사이:

1. **Week 0 GATE 2 — 바코드 인식률 실측** (키와 무관)
   - `web/scripts/barcode-feasibility.html`을 폰에서 열어 25회 스캔
   - 자세한 절차: [`web/README.md`](../web/README.md)

2. **PWA UI 둘러보기** (키 없어도 검색 빼고 동작)
   ```powershell
   cd d:\project\2026\pill-check\web
   npm install
   npm run dev
   ```

3. **DESIGN.md 다시 정독** — 결정 사항이 정말 본인 상황에 맞는지 재확인

---

## 키가 안 와요 / 거절됐어요

- **3영업일 지나도 메일 없으면**: data.go.kr 마이페이지에서 신청 상태 확인. "심사중"이면 더 대기, "반려"면 사유 확인 후 재신청
- **반려 사유 흔한 것**: "활용목적이 구체적이지 않음" → 위 가이드의 활용목적 문장 그대로 다시 사용
- **그래도 안 되면**: data.go.kr 1:1 문의 (응답 1~3일)
