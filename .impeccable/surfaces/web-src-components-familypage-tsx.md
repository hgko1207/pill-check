---
version: 1
slug: "web-src-components-familypage-tsx"
primary_target: "web/src/components/FamilyPage.tsx"
related_targets: ["web/src/components/FamilyAdmin.tsx","web/src/components/FamilySettings.tsx","web/src/components/GroupManageSheet.tsx"]
---

# Surface: 가족 탭 (그룹별 관리자)

- 모드: Operate. 자녀(관리자·함께 보는 가족)가 부모님 약을 확인하고, 가끔 초대·관리를 하는 화면. 부모님 기기에는 보통 안 보인다(설정 → 가족 연결 아래 "가족 약 함께 보기"로만 들어옴).
- 범위: `web/src/components/FamilyPage.tsx`, `FamilyAdmin.tsx`, 그룹 관리 덮는 화면, 설정의 가족 연결 묶음(입구·동의 문구).
- 사용자 결정(2026-11-15): 구조 시안 ③ "그룹 칩 + 한 그룹씩"(plan.md 51). 예시 placeholder 금지("우리 집·처가" 같은 예시를 입력칸에 넣지 않음).

## Direction contract

THESIS: 가족 탭을 열면 고른 그룹 하나의 "누가 무슨 약을 드시나"가 바로 보인다. 그룹 여러 개를 세로로 쌓고 관리 메뉴를 모두 펼쳐 두는 배치를 거부한다.

OWN-WORLD: DESIGN.md 그대로. 미색 바탕, 흰 묶음 목록(22px, 줄 구분선), 선택 칩은 Ink 반전, 인디고는 주 버튼·선택 탭에만, 아이콘 타일은 Indigo Mist, lucide 선 아이콘, Pretendard.

STORY: 열면 내 그룹 칩이 위에 있고 첫 그룹이 골라져 있다. 사람별 약을 읽는다. 내가 관리자인 그룹이면 아래에 "약 드시는 분 초대 · 함께 볼 가족 초대 · 그룹 관리" 줄이 있고, 함께 보는 가족으로만 속한 그룹이면 "그룹 나가기" 하나뿐이다.

FIRST VIEWPORT: 큰 제목 "가족" + 오른쪽 새로 고침 원형 버튼(56px). 아래 가로 칩 줄(그룹들 + "새 그룹". 그룹이 1개여도 칩 줄을 둔다 — "새 그룹"에 늘 닿게, 구현 중 결정). 그 아래 내 역할 한 줄(관리자 꼬리표), 사람별 묶음(아이콘 타일·이름·역할·마지막 사용, 그 아래 약 이름 + 의약품/영양제 꼬리표). 그다음 관리 줄 묶음. 서명 동작: 칩을 바꾸면 그룹 내용이 칩 쪽에서 짧게 밀려 들어온다(180ms, 움직임 줄이기면 즉시).

FORM: 시안 ③(사용자 선택, 추천안), seed:a1ac5ef3916ee29b

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
