---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: ["web/src/components"]
---

# Surface: 약똑똑 앱 전체 (확인 · 내 약 · 설정 · 상세)

- 모드: Operate. 60대 부모님이 매장·거실에서 제품을 확인하는 작업 화면.
- 범위: 앱 셸(상단 내비·하단 탭), 확인(홈·검색·결과·성분 카드), 상세(의약품·영양제), 내 약, 설정, 대화상자·토스트·빈 상태·오류.
- 사용자가 고른 기준: 앱 표준(토스·카카오뱅크·애플 건강·네이버 앱 완성도). 문장이 어색하게 끊기거나 말줄임으로 잘리면 안 된다.
- 비교 기준 화면: 충돌 결과. 확인용 시안 `.impeccable/mocks/canon-app.html`(홈·결과·영양제 상세).
- 미결: 앱 아이콘·스플래시, 앱 마켓용 이름 표기.

## Direction contract

THESIS: 휴대폰에 이미 있는 앱처럼 깔끔한 앱 표준. 결과 한 문장이 화면의 주인공이다. 웹페이지식 카드 나열, 왼쪽 색띠, 이모지 아이콘, 제목 위 작은 라벨을 거부한다.

OWN-WORLD: 옅은 회색 바탕(#F2F4F6)에 흰 묶음 목록(모서리 20px, 줄 구분선), Pretendard 한 가족, 브랜드 인디고(#4A4FD0)는 주 버튼·선택 탭에만. 결과 4색은 옅은 색 블록 + 원형 아이콘 + 진한 글자. lucide 선 아이콘 한 벌. 하단 탭 3개(확인·내 약·설정).

STORY: 열면 "어떤 제품을 확인할까요?"와 검색창이 먼저 보인다. 이름·바코드·TV 성분으로 찾고, 결과는 큰 한 문장과 내 약별 상태로 이해하고, 다음 행동(다른 제품 확인·약사에게 보여 주기)을 바로 누른다.

FIRST VIEWPORT: 결과 화면 기준. 상단 내비(뒤로 + 확인한 제품명), 그 아래 상태 색 블록(원형 아이콘 52px, 결론 30px 굵게, 2~3줄 설명, 근거 한 줄), "내 약 N개와 비교했어요" 묶음 목록(약 이름 왼쪽, 상태 점+글자 오른쪽), 하단 고정 버튼 2개(AI 해설 · 다른 제품 확인), 그 아래 탭바. 서명 동작: 결과 블록이 한 번 부드럽게 올라오며 아이콘이 그려진다(감속 곡선, 움직임 줄이기 설정 시 생략).

FORM: canon(사용자가 시안 4개 대신 앱 표준을 선택), 기준 앱 토스·카카오뱅크·애플 건강·네이버 앱. seed:a40ff67177540b96

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
