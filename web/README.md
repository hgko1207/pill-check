# PillCheck Web (PWA)

DESIGN.md의 Approach A — PWA-first 구현.

## 처음 열기

```bash
cd web
npm install        # 첫 회 ~2분
npm run dev        # http://localhost:5173
```

LAN 같은 와이파이의 폰에서 접속하려면 dev 서버가 띄운 `Network: http://192.168.x.x:5173` URL을 사용. iPhone Safari · Android Chrome 둘 다 동작.

## 환경 변수

```bash
cp .env.example .env
```

`.env`의 `VITE_NEDRUG_API_KEY`에 식약처 인증키(Encoding 키)를 붙여넣고 dev 서버 재시작.
키 발급은 [scripts/week0/README.md](../scripts/week0/README.md) 참조.

## 현재 작동하는 것

- ✅ 약 검색 화면 (식약처 의약품정보 API 호출, dev 프록시로 CORS 회피)
- ✅ 바코드 스캔 (html5-qrcode, 후면 카메라)
- ✅ 60대 UX baseline (18px+ 폰트, 56px+ 버튼, WCAG AA 색상)
- ✅ Service Worker + Manifest (vite-plugin-pwa, "홈 화면에 추가" 가능)
- 🚧 IndexedDB(Dexie) 마스터 캐싱 — Week 2
- 🚧 등록 약 ↔ 스캔 제품 DUR 매칭 — Week 3
- 🚧 결과 화면 빨강/노랑/회색/초록 카드 — Week 3

## Week 0 GATE 2 — 바코드 인식률 실측

`scripts/barcode-feasibility.html` 파일을 폰에서 열어 흔한 영양제 5개를 각 5번씩 스캔.
판정: ≥70% PWA 유지 · 50~70% 회색존 · <50% Capacitor 결정.

폰에서 접속하는 방법 (둘 중 하나):
1. **dev 서버 활용**: `npm run dev` → `http://192.168.x.x:5173/scripts/barcode-feasibility.html` (단 vite는 기본적으로 `scripts/` 정적 서빙 안 함 — `public/`에 복사하면 됨)
2. **GitHub Pages / Vercel preview**: 파일을 잠시 호스팅. 가장 간단한 건 `npx serve scripts` 후 LAN IP로 접속.

가장 빠른 방법:
```bash
cp scripts/barcode-feasibility.html public/feasibility.html
npm run dev
# 폰 Safari/Chrome에서 http://192.168.x.x:5173/feasibility.html
```

## 빌드 & 배포 (Week 3 이후)

```bash
npm run build     # dist/ 생성
npm run preview   # 로컬에서 빌드 결과 확인
```

배포는 Vercel 또는 Cloudflare Pages 권장 (Git push 시 자동 빌드). `web/`을 root directory로 설정.

## 폴더 구조

```
web/
├── public/
│   └── icon.svg              # PWA 아이콘 (홈 화면 추가 시)
├── scripts/
│   └── barcode-feasibility.html  # Week 0 GATE 2 실측용 standalone
├── src/
│   ├── main.tsx              # 엔트리
│   ├── App.tsx               # 루트 컴포넌트
│   ├── App.css               # 60대 baseline 토큰 + 컴포넌트 스타일
│   ├── components/
│   │   ├── SearchScreen.tsx  # 검색 + 바코드 통합 화면
│   │   ├── BarcodeScanner.tsx
│   │   └── Disclaimer.tsx    # 면책 문구 (DESIGN.md 정의)
│   └── lib/
│       ├── nedrug-api.ts     # 식약처 API 클라이언트
│       └── types.ts
├── index.html
├── vite.config.ts            # PWA 설정 + dev proxy(CORS)
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .env.example
└── .gitignore
```

## 알려진 제약 (V1)

- **iOS Safari "홈 화면에 추가"는 자동 prompt 없음** — 첫 진입 시 Share 시트 → "홈 화면에 추가" 안내 필요. UI에 큰 가이드 카드로 처리(Week 4).
- **Production CORS**: dev 프록시는 `npm run dev`에만 작동. 배포 시 식약처 API 호출이 CORS 차단되면 Cloudflare Worker 1-파일 proxy로 우회 (Week 1 후반에 결정).
- **바코드 정확도**: html5-qrcode는 ML Kit 대비 떨어짐. 실측 결과 < 70%면 Capacitor wrap (V1.5).
