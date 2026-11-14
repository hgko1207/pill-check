# 약똑똑 (PillCheck)

60대 부모님과 그 자녀가 쓰는 약·영양제 상호작용 체크 PWA. 바코드·검색으로 제품을 찾아 등록한 약과의 DUR 충돌을 빨강/노랑/회색/초록으로 보여 준다.
- 스택: Vite 6 + React 19 + TypeScript(strict), Dexie(IndexedDB), vite-plugin-pwa, html5-qrcode. AI 해설은 Cloudflare Pages Function(`web/functions/api/llm.ts`) → Gemini. 배포는 Cloudflare Pages(`https://pill.hgko.dev`).
- 답변은 한국어로, 코드 식별자는 영문으로 쓴다.

## 구조

- `web/src/components/` — 화면·UI 컴포넌트 (`SearchScreen.tsx`, `InteractionResultCard.tsx` 등)
- `web/src/lib/` — API 클라이언트(`nedrug-api.ts`, `healthfood-api.ts`, `dur.ts`, `llm.ts`), DB(`db.ts`), 에러 변환(`errors.ts`), 타입(`types.ts`)
- `web/src/App.css` — 디자인 토큰(`--pc-*`, 다크 모드 `html[data-theme='dark']`) + 컴포넌트 스타일
- `web/functions/` — Cloudflare Pages Function (서버 측 키 사용, `functions/api/llm.ts` → `/api/llm`)
- `scripts/week0/` — Week 0 GATE 1 데이터 검증용 Python 스크립트 (앱 빌드와 무관)
- `docs/product-design.md` — 제품 설계 문서(소스 오브 트루스), `docs/api-key-guide.md` — 식약처 API 키 발급
- `PRODUCT.md`·`DESIGN.md` — `/impeccable` 디자인 스킬용 제품 정의와 디자인 시스템(색·글꼴·컴포넌트). 화면 디자인 결정은 `DESIGN.md`를 따른다
- 새 화면은 `web/src/components/`에 `SettingsPage.tsx`처럼, 새 외부 API 클라이언트는 `web/src/lib/`에 `healthfood-api.ts`처럼(전용 Error 클래스 + `friendlyError` 연결) 만든다.

## 명령

| 용도 | 명령 |
|---|---|
| 설치 | `npm --prefix web install` |
| 실행 | `npm --prefix web run dev` (LAN 노출, 폰 접속용) |
| 빌드 | `npm --prefix web run build` |
| 배포 | `cd web && npm run build && npx wrangler pages deploy dist --project-name pill-check --branch main` (push로 자동 배포 안 됨, `web/`에서 실행해야 `functions/`가 같이 올라감) |

## 검증 명령

`verify` 스킬이 이 순서로 실행한다. 실제로 실행해 확인한 명령만 적는다.

1. 타입체크: `npm --prefix web run typecheck` (`tsc --noEmit`, `web/src`만 대상 — `web/functions/`는 검사 안 됨)
2. 빌드: `npm --prefix web run build`
- 린트·테스트는 아직 없다. 동작 확인은 `npm --prefix web run dev` 후 브라우저/폰에서 한다.

## 원칙

1. **코딩 전에 생각한다** — 모르면 모른다고 한다. 방법이 여럿이면 선택지를 먼저 보인다.
2. **단순하게** — 요청을 푸는 최소한의 코드만. 나중을 위한 추상화를 미리 넣지 않는다.
3. **요청 범위만 고친다** — 옆 코드를 겸사겸사 고치지 않는다. 다른 개선거리는 따로 제안한다.
4. **검증될 때까지** — 완료 기준을 정하고, 실제 실행 결과로 확인될 때까지 반복한다.
5. **근거를 붙인다** — 동작을 말하기 전에 파일을 열어 본다. 주장에는 `파일:줄`이나 실행 출력을 붙이고, 못 붙이면 "확인 안 함"이라고 쓴다.

## 작업 방식

- 파일 여러 개를 고치는 작업은 `/team-ai:plan-feature`로 계획을 세워 `plan.md`에 적고, 승인 후 구현한다. ("계획 세워줘"로도 동작하지만 자동 호출은 매번 보장되지 않으므로 이름으로 부르는 것을 기본으로 한다.)
- `plan.md` 항목을 끝내면 `[x]`로 표시하고 "완료"로 옮긴다.
- 구현 후 `verify`로 검증한다. 검증하지 않고 완료라고 말하지 않는다.
- 작업이 끝나면 대화를 끊고, 다음 작업은 `plan.md`와 이 파일을 근거로 새로 시작한다.

## 작업 진행 방식

- 내 입력이 필요 없는 단계면 계속 진행한다.
- 진행 상황 메모는 다음 작업과 같은 메시지에 쓴다.
- 나 없이는 진행할 수 없을 때, 또는 삭제처럼 되돌리기 어려운 작업 전에만 멈추고 묻는다.

## 코딩 규칙

- 사용자에게 보이는 에러는 `web/src/lib/errors.ts`의 `friendlyError`로 변환한다. 영문 기술 용어 없이, 다음 행동을 함께 안내한다.
- 색·간격·그림자는 `App.css`의 `--pc-*` 토큰을 쓰고, 다크 모드는 `html[data-theme='dark']`로 맞춘다.
- 코드 스타일은 기존 파일을 따른다: 세미콜론 없음, 작은따옴표, 2칸 들여쓰기 (포매터 미설정).

## 커밋 규칙

- Conventional Commits, 범위는 `web` 등 폴더 이름, 제목은 한국어. 예: `fix(web): 설정 페이지 narrow-width 마감`
- 기본 브랜치에 직접 커밋하지 않는다.

## 하지 말 것

- `web/src/lib/db.ts`의 기존 `this.version(N)` 블록을 고치지 않는다 — 스키마 변경은 새 버전 + `upgrade()`로 추가한다 (사용자 기기에 이미 저장된 데이터).
- 서버 전용 키(`GEMINI_API_KEY`)를 `VITE_` 변수나 클라이언트 코드로 옮기지 않는다 — `VITE_*`는 번들에 그대로 들어간다. 운영 호출은 `/api/llm` 경유.
- 결과 문구에서 "안전하다"고 단정하지 않는다 — 초록도 "충돌이 확인되지 않음(참고용)"이다. 면책 문구(`Disclaimer.tsx`)를 빼지 않는다.
- 테스트를 통과시키려고 테스트를 지우거나 건너뛰게 바꾸지 않는다.
- 비밀값(.env, 키)을 읽거나 코드에 넣지 않는다.

## 용어

- DUR — 식약처 의약품안전사용서비스. 병용금기(빨강)·병용주의(노랑) 판단 근거
- 등록약 — 사용자가 복용 중이라고 등록한 약·영양제 (`RegisteredMedication`, `kind: 'drug' | 'healthfood'`)
- `itemSeq` — 식약처 품목기준코드(ITEM_SEQ). 영양제는 신고번호

## 참고 문서

- `docs/ai-workflow.md` — 팀 AI 사용 가이드
- `docs/product-design.md` — 제품·UX 설계 (60대 UX 기준, 색상 매핑)
- `web/README.md` — 웹앱 셋업, 알려진 제약

<!-- 기준: team-ai-kit v0.2. 100줄 안쪽 유지. 규칙 하나가 5줄을 넘으면 docs/로 빼고 링크만 남긴다. -->
