---
paths:
  - "web/**/*.ts"
  - "web/**/*.tsx"
  - "web/**/*.css"
---

# TypeScript / React (web) 규칙

## 구조
- 화면·UI는 `web/src/components/`, 외부 API·DB·순수 로직은 `web/src/lib/`. 컴포넌트가 `lib/`를 쓰고, `lib/`는 컴포넌트를 import하지 않는다.
- 외부 API 클라이언트는 실패를 전용 Error 클래스로 던지고(`NedrugRequestError`, `FoodSafetyAuthError` 등), 화면에서는 `friendlyError(e)`로 바꿔 보여 준다.
- 식약처 API는 dev에서 Vite 프록시(`/api/nedrug`, `/api/foodsafety`)를 탄다. 새 엔드포인트는 `vite.config.ts` 프록시와 `import.meta.env.DEV` 분기를 같이 맞춘다.
- `web/functions/**/*.ts`는 Cloudflare Pages Function이다(`context.env`로 키를 읽음). 서버 키는 여기서만 읽는다.

## 코드 스타일
- 포매터·린터 없음. 세미콜론 없음, 작은따옴표, 2칸 들여쓰기를 손으로 맞춘다.
- tsconfig `strict` + `noUnusedLocals`/`noUnusedParameters` — 안 쓰는 변수·인자는 지운다.
- 타입 import는 `import { type X }` 형식을 쓴다 (`db.ts` 참고).

## 이 스택의 함정
- Dexie 스키마: 기존 `this.version(N)`은 고치지 않고 새 버전을 추가한다. 캐시 형식이 바뀌면 `upgrade()`에서 해당 테이블을 비운다 (v4 `durCache` 사례).
- `VITE_*` 환경 변수는 클라이언트 번들에 그대로 들어간다. 비밀 키를 `VITE_`로 두지 않는다.
- 60대 UX 기준: 본문 18px 이상, 터치 영역 56px 이상, WCAG AA 대비. 색은 `--pc-*` 토큰으로, 다크 모드(`html[data-theme='dark']`)도 같이 확인한다.
- 좁은 화면(갤럭시 412dp)에서 레이아웃이 깨진 적이 있다. 가로 폭이 바뀌는 수정은 좁은 폭에서도 본다.

## 검증
- `npm --prefix web run typecheck`, `npm --prefix web run build` (CLAUDE.md 검증 명령).
- `web/functions/`는 타입체크 대상이 아니므로 고쳤다면 직접 읽어 확인하고 그렇다고 보고한다.
- UI 변경은 `npm --prefix web run dev`로 띄워 눈으로 확인하기 전에는 "된다"고 말하지 않는다.
