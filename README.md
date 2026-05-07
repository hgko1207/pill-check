# PillCheck

60대 부모님과 그 자녀를 위한 영양제·일반의약품 상호작용 체크 PWA.

> 약국이 절대 안 알려주는 정보를, 바코드 한 번에.
> 부모님이 매장에서 마트 셀프계산대 쓰듯이 "삑" 한 번 하면 빨강/노랑/초록으로 답이 나옵니다.

---

## 상태

🚧 **Week 0 — HARD GATE 검증 단계.** 빌드 시작 전. PWA 스캐폴드 ready.

설계 문서: **[DESIGN.md](DESIGN.md)** (Status: APPROVED, /office-hours 9/10 리뷰 통과)

---

## 시작하기

### 1️⃣ API 키 발급 (1~5영업일)

식약처 OpenAPI **활용신청 4건 → 인증키 2개** 발급:
- data.go.kr: 의약품 제품 허가정보 + **DUR 성분정보(핵심)** + DUR 품목정보 → **인증키 1개**
- 식품안전나라: 건강기능식품 정보 → **인증키 1개**

자세한 절차: **[docs/api-key-guide.md](docs/api-key-guide.md)**

### 2️⃣ Week 0 GATE — 두 가지 검증 (빌드 전 필수)

**GATE 1: 데이터 매칭 가능성 (키 도착 후)**
```bash
cd scripts/week0
python -m venv .venv && .venv/Scripts/activate  # Windows
pip install -r requirements.txt
cp .env.example .env  # NEDRUG_API_KEY 채우기
python validate_dur.py
```

**GATE 2: PWA 바코드 인식률 (키와 무관, 지금 가능)**
```bash
cd web
cp scripts/barcode-feasibility.html public/feasibility.html
npm install && npm run dev
# 폰에서 http://192.168.x.x:5173/feasibility.html 열기
# 흔한 영양제 5개 × 5번 스캔 → 자동 PASS/FAIL 판정
```

### 3️⃣ 둘 다 PASS면 Week 1 본격 빌드

```bash
cd web
cp .env.example .env  # VITE_NEDRUG_API_KEY 채우기
npm run dev
```

---

## 구조

```
pill-check/
├── DESIGN.md                 # 설계 문서 (소스 오브 트루스)
├── docs/
│   └── api-key-guide.md      # 식약처 OpenAPI 발급 가이드
├── scripts/week0/            # GATE 1 — Python 데이터 검증
└── web/                      # PWA (Vite + React + TypeScript)
    ├── src/                  # 앱 소스
    ├── scripts/              # GATE 2 — 바코드 인식률 실측 (standalone)
    └── README.md             # 웹앱 셋업 가이드
```

---

## Stack

PWA-first 전략. 인식률 부족 시 Capacitor wrap (V1.5).

- **Frontend**: Vite + React 19 + TypeScript
- **Barcode**: html5-qrcode (V1) → ML Kit via Capacitor (V1.5 트리거 시)
- **Storage**: Dexie (IndexedDB)
- **Offline**: vite-plugin-pwa (Service Worker)
- **Data**: 식약처 의약품안전나라 + 식품안전나라 OpenAPI
- **Hosting**: Vercel / Cloudflare Pages 무료 티어 (V2)
- **Backend**: 없음 (CORS 시 Cloudflare Worker proxy 1개)

---

## 색상 매핑 (DUR 심각도 → UI)

| 색상 | 트리거 | 메시지 |
|---|---|---|
| 🔴 빨강 | DUR 병용금기 매칭 | "위험 — 함께 드시면 안 됩니다. 약사 선생님께 보여주세요." |
| 🟡 노랑 | DUR 병용주의 매칭 | "주의가 필요합니다. 약사 선생님 상담을 권합니다." |
| ⚪ 회색 | 매칭 데이터 없음 | "이 제품의 상호작용 정보가 부족합니다. 약사 선생님께 확인하세요." |
| 🟢 초록 | 매칭 안 됨 (등록 약과의 충돌 미발견) | "현재 등록된 약과의 충돌은 확인되지 않았습니다. (참고용)" |

---

## 면책

본 정보는 **식품의약품안전처 공공데이터를 기반으로 한 참고 자료**입니다.
의료 행위가 아니며, 약사·의사 상담을 대체하지 않습니다.
실제 복용 결정은 전문가와 상의하세요.
