# plan.md

> 계획은 여기 적고, 구현은 "다음 작업"을 위에서부터 진행한다. 끝난 항목은 `[x]`로 표시하고 "완료"로 옮긴다.

## 현재 상태

- `web/` PWA가 동작한다: 약·영양제 검색/바코드 스캔, 등록, DUR 충돌 결과 카드, Gemini AI 해설, 설정·다크 모드. DUR·AI 해설은 Dexie에 영구 캐시(스키마 v4).
- 검증 수단은 타입체크(`tsc --noEmit`)와 `vite build`뿐이다. 린트·테스트는 없다.
- 번들이 676kB라 빌드에서 500kB 초과 경고가 난다(기능 영향 없음).
- 영양제 "TV 말 확인"(설계 `docs/designs/tv-claim-check.md` 추천안 B) 1~4 구현 완료(2026-11-11): 상세에 함량·가격 버튼·성분 확인·회수 이력, 검색 결과에 같은 이름 묶기·성분 설명 카드. 성분 대조 검증은 `node scripts/gate-search/check-ingredients.mjs`(로컬 I0030 필요).

## 다음 작업 (구현 예정)

<!--
항목 형식 (plan-feature 스킬이 이 형식으로 추가한다)

### [ ] 작업 제목
- 목표: 무엇이 되면 끝인가 (완료 기준)
- 맥락: 왜 하는가
- 변경할 파일: 경로 — 무엇을
- 참조: 따라 할 기존 코드
- 검증: 실행할 명령, 추가할 테스트
- 안 하는 것: 범위 밖
- 멈춤 조건: 이럴 땐 멈추고 묻는다
-->

> 아래 4개는 `docs/designs/tv-claim-check.md` 추천안 B(TV 말 확인)를 나눈 것이다. 위에서부터 순서대로 한다.

#### 결정 (2026-11-11 승인 시 추천안으로 확정)
- 성분 기능성 문구 출처(설계 미결 1): 추천은 **데이터에서 뽑기**(그 성분이 대표 품목인 제품들의 `PRIMARY_FNCLTY` 중 가장 흔한 문구)다. 고시·인정 원문을 찾는 안은 출처 조사가 따로 필요하다.
- 별칭표 범위(설계 미결 2): 추천은 **시험한 5개로 시작**하는 것이다. 홍삼·프로바이오틱스·콘드로이친·MSM·코엔자임Q10은 정규식을 데이터로 검증한 뒤 따로 추가한다.

#### 따로 발견한 것 (이번 범위 밖, 따로 제안)
- 영양제 결과 `id`가 `PRMS_DT`(허가일자)부터 쓰인다(`web/src/components/SearchScreen.tsx:47`). `addMedication`은 `itemSeq`가 같으면 중복으로 막으므로(`web/src/lib/db.ts:100-101`) **허가일이 같은 서로 다른 영양제는 두 번째가 등록되지 않는다.** React `key`도 겹칠 수 있다. `PRDLST_REPORT_NO`로 바꾸면 이미 등록된 데이터와 어긋나므로 따로 계획이 필요하다.
- 다크 모드에서 검색 입력칸 글자가 검은색이다(`.input`에 글자색 없음, 계산값 `rgb(0,0,0)` on `rgb(33,29,26)`). 새 성분 입력칸은 `.ingr-check__input`에서만 고쳤다.
- 충돌 결과 카드의 회색 제목(`.result-card__title--unknown`, `#9A9388` on `#ECE7DB`)은 대비 약 2.4:1로 AA 미달. 성분 확인 카드에서만 본문 색으로 바꿨다.
- 영양제 검색 결과에 "(구) …" 제품이 맨 위에 나온다(예: "루테인" → "(구) 눈에좋은 루테인+오메가3"). 설명 카드 통계에서는 빼지만 검색 결과는 API 순서 그대로다.

## 완료

### [x] 4. 회수 이력 표시
- 목표: 영양제 상세 창을 열면 식약처 회수 목록(`I0490`)과 대조해서, 일치하면 위쪽에 빨간 "회수 이력 있음: (회수 사유)"가 뜬다. 일치가 없으면 아무것도 표시하지 않는다("회수 없음, 안전" 같은 문구를 쓰지 않는다). 회수 목록을 못 받으면 상세는 그대로 보이고 "회수 이력을 확인하지 못했어요" 한 줄만 뜬다.
- 맥락: 설계 1절 표의 회수 이력. 시험에서 밀크씨슬 2건 일치.
- 변경할 파일:
  - `web/src/lib/healthfood-api.ts` — `fetchRecalls()`(`I0490` 1~1000건, 세션 메모리 캐시)와 `findRecall(item, recalls)`.
  - `web/src/lib/errors.ts` — 필요하면 회수 조회 실패 문구.
  - `web/src/components/DetailModal.tsx` — `HealthFoodDetail`에서 조회·표시.
  - `web/src/App.css` — 기존 `.modal-warn`(`App.css:878`) 재사용, 부족하면 보강.
- 참조: 대조 규칙은 `scripts/gate-search/gate.mjs:23-32`(품목보고번호 일치, 없으면 제품명+업체 일치). 호출 구조는 `searchHealthFood`. 시판 중단 경고는 `DetailModal.tsx:93-98`.
- 검증: typecheck, build. dev에서 시험 때 회수 일치가 나온 밀크씨슬 제품 상세 → 빨간 표시. 이름은 구현 때 `gate.mjs` 결과로 확인한다.
- 안 하는 것: Dexie 캐시(스키마 변경이 필요하므로 하지 않는다), 검색 카드에 회수 배지.
- 멈춤 조건: `I0490`이 1000건을 넘거나 브라우저에서 CORS로 막히면 멈추고 묻는다. 지금 391건이고, 운영 브라우저에서 호출되는지는 확인 안 함.
- 결과(2026-11-11): typecheck·build 통과. dev에서 `I0490` 호출 성공(건강기능식품 31건). "메타그린 슬림업" 상세 → 빨간 "식약처 회수 이력이 있는 제품이에요 / 회수 사유: 초산에틸 검출", 같은 이름의 "(일본 FFC)" 신고는 표시 없음. 회수 요청을 일부러 실패시키면 상세는 그대로, "회수 이력을 확인하지 못했어요" 한 줄. 다크 모드 확인. 운영(Vercel) 브라우저에서 CORS로 막히는지는 확인 안 함(기존 영양제 검색과 같은 주소·방식).
- 계획과 달라진 점: `searchHealthFood`의 요청 처리를 `fetchService`로 빼서 회수 조회와 같이 쓴다(동작 같음). 빨간 글씨는 대비(약 3.3:1) 때문에 본문 색, 빨강은 바탕·테두리로.

### [x] 3. 성분 요약 JSON 생성 + 성분 설명 카드
- 목표:
  - `node scripts/gate-search/ingredient-summary.mjs`가 `web/src/data/ingredient-summary.json`을 만든다. 성분별로 이 성분이 원료인 소비자용 신고 제품 수, 대표 기능성 문구, 대표 주의사항, 생성일이 들어간다. 10KB 이하.
  - 검색어가 별칭표 성분이면(예: "루테인", "밀크씨슬") 검색 결과 맨 위에 카드가 뜬다: 성분 이름, 기능성 문구, 주의사항, "이 성분이 원료인 신고 제품 ○개 (○○○○-○○-○○ 기준)".
- 맥락: 설계 3절. 원료 필터가 API에서 안 먹으므로 실시간으로 셀 수 없다.
- 변경할 파일:
  - `scripts/gate-search/ingredient-summary.mjs` (새 파일) — `ingredient-alias.ts` 표를 import, 제외 규칙은 `gate.mjs:35-40` `excludeReason`과 같게.
  - `web/src/data/ingredient-summary.json` (새 파일, 생성물이지만 커밋한다).
  - `web/src/components/IngredientCard.tsx` (새 파일).
  - `web/src/components/SearchScreen.tsx` — 결과 목록 위에 카드.
  - `web/src/App.css` — 카드 스타일.
- 참조: 데이터 읽기는 `scripts/gate-search/gate.mjs:19-21`. 카드 모양은 기존 `.card`.
- 검증: 스크립트 실행 후 JSON 크기·내용 확인, typecheck, build. dev에서 "루테인" 검색 → 맨 위 카드.
- 안 하는 것: 제품 목록·순위, 자동 갱신(월 1회 수동).
- 멈춤 조건: 대표 기능성 문구를 데이터에서 뽑았는데 여러 성분 문구가 섞여 나오면(복합 제품 영향) 사례를 보여 주고 묻는다.
- 결과(2026-11-11): `ingredient-summary.mjs` → `web/src/data/ingredient-summary.json` 2,953 bytes. typecheck·build 통과. dev 412px "루테인" 검색 → 맨 위 카드(기능성 1줄, 주의사항 접힘, 제품 이름 1,582개), 다크 모드 확인, "타이레놀"은 카드 없음.
- 계획과 달라진 점: 문구는 기능성 원료가 그 성분 하나뿐인 제품만 세어 복합 제품 문구가 섞이지 않게 했다(B-3는 이런 제품이 10건뿐이라 표본이 작다). 주의사항은 화면이 길어져 "섭취 시 주의사항 보기"로 접었다.

### [x] 2. 성분 별칭표 + "TV에서 들은 성분 확인"
- 목표:
  - 영양제 상세 창에 성분 칩(비피더스 B-3, 루테인, 비타민 D, 밀크씨슬, 오메가3)과 직접 입력 칸이 있다.
  - 누르면 ✅ 들어 있어요(일치한 원료 원문 표시) / ❌ 이 제품 원료에는 없어요(대신 들어 있는 주요 원료 표시) / 확인 못 했어요(별칭표에 없는 성분이거나 원료 칸이 빔, 약사 확인 안내) 중 하나가 크게 뜬다.
  - 결과 아래에 "식약처 신고 원료 기준이에요. 효과를 보장하지 않아요."가 있다.
  - 대조 스크립트가 통과한다: 비피움 비쓰리 다이어트·쓰리핏 유산균 다이어트 = B-3 ✅, 다이어트 유산균 비에날씬 = B-3 ❌. (쓰리핏은 구현 중 데이터 재확인으로 정정)
- 맥락: 설계 2절. 판정은 LLM이 아니라 원료명 글자 대조로 한다(전제 4).
- 변경할 파일:
  - `web/src/lib/ingredient-alias.ts` (새 파일) — 성분별 `{ key, label, aliases: RegExp }` 표와 `matchIngredient(item, query)` → `{ result: 'yes' | 'no' | 'unknown', matched?: string, mainRaw?: string[] }`. import 없는 순수 TS로 둬서 Node가 바로 읽게 한다.
  - `web/src/components/IngredientCheck.tsx` (새 파일) — 칩·입력·결과 표시.
  - `web/src/components/DetailModal.tsx` — `HealthFoodDetail`에 `IngredientCheck` 넣기.
  - `web/src/App.css` — 칩·결과(✅ 초록 / ❌ 회색 / 확인 못 함 회색) 스타일.
  - `scripts/gate-search/check-ingredients.mjs` (새 파일) — `web/src/lib/ingredient-alias.ts`를 import(Node 24 타입 제거)해 로컬 `I0030` 데이터에서 위 3개 제품 결과와 성분별 일치 건수를 출력하고, 기대와 다르면 exit 1.
- 참조: 정규식 출발점은 `scripts/gate-search/gate.mjs:11-17` `INGREDIENTS`. 결과 카드 모양은 `web/src/components/InteractionResultCard.tsx`.
- 검증: `node scripts/gate-search/check-ingredients.mjs`(로컬 `data/` 필요), typecheck, build. dev에서 비피움 비쓰리 상세 → B-3 칩 → ✅.
- 안 하는 것: 함량이 충분한지 판단, 효과 설명, 1단계 5개 외 성분(아래 "결정 필요" 참고).
- 멈춤 조건: 별칭 정규식이 시험 5성분 상위 제품 원문과 어긋나는 경우가 나오면(예: 비타민 D가 "비타민 D 결핍" 문구에 걸림) 고치기 전에 사례를 보여 주고 묻는다.
- 결과(2026-11-11): `check-ingredients.mjs` 모두 통과, typecheck·build 통과. dev 412px에서 비에날씬 × B-3 = ❌(대신 BNR17), 쓰리핏 × "비쓰리" 입력 = ✅(다크 모드), "홍삼" = 확인 못 했어요, 루테인 마리골드 × 루테인 = ✅ "마리골드꽃추출물 (루테인이 든 원료)" 확인.
- 계획과 달라진 점: ① 쓰리핏은 데이터상 B-3가 들어 있어 기대값을 ✅로 정정(SALES-CHECK.md·설계 문서도 정정). ② 데이터 대조로 별칭 추가: 루테인에 마리골드꽃추출물(1,528건 중 1,524건이 기준규격에 루테인 표시량), 오메가3에 "오메가-3지방산함유유지", 밀크씨슬에 "밀크시슬"·실리마린. ③ 기능성 원료에 없고 기타 원료(`ETC_RAWMTRL_NM`)에만 있으면 ✅ + "기능성 원료가 아닌 기타 원료로 신고됐어요". ④ 새 결과 카드의 ❌ 제목은 대비 때문에 본문 색.

### [x] 1. 영양제 상세 보강: 함량·제조·가격 버튼·같은 이름 묶기
- 목표:
  - 영양제 상세 창 위쪽에 "제조: ○○"(지금은 "업체")와 함량 표시량 줄이 보인다. 표시량 줄이 없으면 그 칸을 숨긴다.
  - [네이버에서 가격 보기] [쿠팡에서 가격 보기] 버튼이 제품명 검색 페이지를 새 탭으로 연다.
  - 검색 결과에서 띄어쓰기·"(주)"만 다른 같은 제품명은 카드 1개로 묶이고, 카드에 "같은 이름 신고 N건(제조 공장 다름)"이 표시된다.
- 맥락: 설계 1절. 주된 기능성·섭취 방법·주의사항·원료는 `HealthFoodDetail`(`web/src/components/DetailModal.tsx:132-201`)이 이미 보여 준다. 빠진 것은 함량, 제조 표기, 가격 버튼, 묶기다.
- 변경할 파일:
  - `web/src/lib/healthfood-api.ts` — `HealthFoodItem`에 `LAST_UPDT_DTM` 추가. 순수 함수 `doseLines(item)`(`STDR_STND`에서 "표시량" 줄 추출)와 `groupSameName(items)`(정규화 이름으로 묶고 최근 수정일 것을 대표로) 추가.
  - `web/src/components/DetailModal.tsx` — `HealthFoodDetail`에 함량 줄, "제조" 표기, 가격 버튼 2개.
  - `web/src/components/SearchScreen.tsx` — 영양제 결과에 `groupSameName` 적용, 묶인 건수 표시. 영양제 카드의 "업체" 표기를 "제조"로.
  - `web/src/App.css` — 가격 버튼·함량 줄 스타일(`--pc-*` 토큰, 다크 모드 포함).
- 참조: 표시량 추출은 `scripts/gate-search/gate.mjs:42-47` `doseLine`, 이름 정규화는 `gate.mjs:25` `norm`. 버튼은 `.btn-small`(`App.css:1267`).
- 검증: `npm --prefix web run typecheck`, `npm --prefix web run build`. dev 서버에서 "비피움", "루테인" 검색 → 묶음 표시·함량 줄·버튼이 새 탭으로 열리는지 확인.
- 안 하는 것: 하루 섭취량 환산, 가격 숫자 표시, 쇼핑몰 페이지 읽기, 제휴 링크. 버튼 문구에 "사세요/추천" 금지.
- 멈춤 조건: 묶기 때문에 영양제 결과 `id`(지금 `PRMS_DT`)를 바꿔야 하면 멈추고 묻는다. 이미 등록된 영양제의 `itemSeq`와 어긋날 수 있다.
- 결과(2026-11-11): typecheck·build 통과, dev 412px에서 "비피움" 검색 → 6건이 5개로 묶임(비피움 비쓰리 다이어트 "같은 이름 신고 2건"), 상세에 함량 4줄·가격 버튼(새 탭) 확인, 다크 모드 확인. 함량 추출은 로컬 I0030에서 "표시량"이 있는 43,220건 중 37,564건(87%). 나머지는 괄호 없는 형식이라 칸을 숨긴다. `id`(PRMS_DT)는 바꾸지 않았다.


