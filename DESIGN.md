---
name: 약똑똑 (PillCheck)
description: 60대 부모님이 직접 쓰는 약·영양제 충돌 확인 앱. 결과 한 문장이 화면의 주인공인 앱 표준 디자인.
colors:
  primary: "#4A4FD0"
  primary-deep: "#3A3EB0"
  primary-soft: "#EEECFB"
  primary-on: "#FFFFFF"
  danger: "#D7263D"
  danger-bg: "#FDECEE"
  danger-ink: "#8A1F2E"
  warn: "#B25E00"
  warn-bg: "#FFF4E0"
  warn-ink: "#6E3B00"
  unknown: "#5B6573"
  unknown-bg: "#EFEBE5"
  unknown-ink: "#343B45"
  safe: "#12805C"
  safe-bg: "#E6F6EF"
  safe-ink: "#0B5A40"
  bg: "#F8F4EE"
  surface: "#FFFFFF"
  surface-2: "#F7F2EA"
  pressed: "#F0E9DE"
  text: "#28221D"
  text-muted: "#5A5047"
  text-subtle: "#66594E"
  placeholder: "#75685C"
  border: "#EAE2D5"
  divider: "#F1EBE2"
  chevron: "#BCB1A3"
  mark-bg: "#FFE68A"
  peach: "#B4531A"
  peach-bg: "#FFEBDD"
typography:
  verdict:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  large-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  sub:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  caption:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
rounded:
  xs: "8px"
  s: "12px"
  m: "16px"
  l: "22px"
  xl: "24px"
  pill: "999px"
spacing:
  pad: "20px"
  gutter: "16px"
  button-min-h: "56px"
  row-min-h: "64px"
  topbar-h: "56px"
  tabbar-h: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-on}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    padding: "0 20px"
    height: "{spacing.button-min-h}"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.m}"
    height: "{spacing.button-min-h}"
  button-plain:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.m}"
    height: "{spacing.button-min-h}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.m}"
    height: "{spacing.button-min-h}"
  button-small:
    rounded: "{rounded.s}"
    padding: "0 16px"
    typography: "{typography.sub}"
    height: "{spacing.button-min-h}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    padding: "0 16px"
    height: "60px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.sub}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "{spacing.button-min-h}"
  chip-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
  group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.l}"
  row:
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "12px 18px"
    height: "{spacing.row-min-h}"
  tag:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "26px"
  verdict-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.xl}"
    padding: "24px 22px 22px"
  verdict-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.xl}"
    padding: "24px 22px 22px"
  verdict-unknown:
    backgroundColor: "{colors.unknown-bg}"
    textColor: "{colors.unknown-ink}"
    rounded: "{rounded.xl}"
    padding: "24px 22px 22px"
  tabbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-subtle}"
    typography: "{typography.label}"
    height: "{spacing.tabbar-h}"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "24px 20px 20px"
    width: "400px"
  toast:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.l}"
    padding: "12px 8px 12px 16px"
---

# Design System: 약똑똑 (PillCheck)

## Overview

**Creative North Star: "The Phone's Own App"**

약똑똑은 휴대폰에 원래 있던 앱처럼 보여야 한다. 기준은 토스·카카오뱅크·애플 건강·네이버 앱의 완성도다. 옅은 회색 바탕 위에 흰 묶음 목록이 놓이고, 글꼴은 Pretendard 한 가족, 아이콘은 lucide 선 아이콘 한 벌이다. 장식은 없다. 화면마다 주인공은 하나이고, 결과 화면에서는 큰 결론 한 문장이 주인공이다.

이 시스템은 60대 부모님이 매장 선반 앞에서 한 손으로 쓰는 것을 전제로 한다. 본문 18px 이상, 모든 누르는 자리 56px 이상, WCAG AA 대비, 라이트와 다크 두 벌, 그리고 글자와 터치 높이를 함께 키우는 큰 글씨 모드가 바닥선이다. 밀도는 낮고, 문장은 잘리지 않고 끝까지 보인다.

색은 의미를 위해 아껴 쓴다. 결과 색(빨강·노랑·회색, 그리고 초록)은 뜻이 고정되어 있고, 브랜드 인디고는 사용자가 다음에 누를 곳을 가리킬 때만 진하게 나온다. 웹페이지식 카드 나열, 왼쪽 색띠, 이모지 아이콘, 제목 위 작은 라벨은 이 세계에 없다.

**Key Characteristics:**
- 옅은 회색 바탕 + 흰 inset grouped 목록(모서리 20px, 줄 사이 1px 구분선)
- Pretendard Variable 한 가족, 굵기로만 위계를 만든다
- 결과는 옅은 색 블록 + 원형 아이콘 + 진한 글자, 뜻은 고정
- 브랜드 인디고는 주 버튼과 선택된 탭에만 진하게
- 하단 탭 3개(확인·내 약·설정)는 늘 보이고, 덮는 화면도 탭바 위에서 끝난다
- 한국어 줄바꿈 규칙(keep-all + 구절 묶기)과 말줄임 금지

## Colors

따뜻한 미색 바탕(2026-11-13, "차가운 은행 앱 같다"는 의견으로 회색에서 바꿈) 위에 의미가 고정된 결과 색 세 가지와 절제된 인디고 하나가 얹힌다. 모든 색은 `App.css`의 `--pc-*` 토큰이고, 다크 모드는 `html[data-theme='dark']`에서 같은 이름으로 다시 정의된다(값은 sidecar `colorMeta`의 `dark`).

### Primary
- **Calm Indigo** (primary): 주 버튼 바탕, 선택된 탭의 아이콘, 포커스 링(3px), 입력 커서, 입력칸 포커스 테두리, 펼친 빠른 메뉴 타일의 안쪽 테두리. 화면에서 다음에 누를 한 곳을 가리킨다.
- **Deep Indigo** (primary-deep): 주 버튼 hover, 옅은 인디고 위 글자(보조 버튼, 안내 띠, 꼬리표, 단계 번호). 다크 모드에서는 밝은 라벤더로 뒤집혀 링크 글자에도 쓴다.
- **Indigo Mist** (primary-soft): 보조 버튼 바탕, 줄·빠른 메뉴의 아이콘 타일 바탕, 정보 안내 띠, 단계 번호 원, 텍스트 선택 색.

### Secondary: 결과 색 (의미 고정)
각 결과 색은 세 벌로 쓴다. 진한 색(아이콘 원·상태 점·결론 제목), 옅은 바탕(-bg), 그 위의 진한 글자(-ink).
- **Contraindication Red** (danger / danger-bg / danger-ink): 병용금기. "함께 안 돼요". 오류 안내 띠, 삭제 버튼, 회수 이력 제목도 이 색이다.
- **Caution Amber** (warn / warn-bg / warn-ink): 병용주의. "주의 필요". 경고 안내 띠에도 쓴다.
- **Unconfirmed Gray** (unknown / unknown-bg / unknown-ink): 확인된 충돌이 없거나 데이터가 부족함. 앱의 충돌 판정에서 "충돌 없음"은 초록이 아니라 이 회색으로 나온다. 결론 제목은 회색이 아니라 본문 글자색(text)을 쓴다.
- **Found Green** (safe / safe-bg / safe-ink): 토큰과 결과 블록 변형은 있지만, 충돌 판정 로직(`lib/dur.ts`)은 이 단계를 내지 않는다. 실제로는 "TV에서 들은 성분이 들어 있음" 결과, 성공 안내 띠, 성공 토스트 아이콘에만 나온다.

### Neutral
- **Warm Linen** (bg): 앱 바탕, 상단 바, 덮는 화면, 하단 고정 버튼 줄의 바탕.
- **Paper White** (surface): 묶음 목록, 입력칸, 빠른 메뉴 타일, 탭바, 대화상자.
- **Soft Panel** (surface-2): 꼬리표 바탕, 평평한 입력칸, 세그먼트 컨트롤 트랙, 표 머리.
- **Pressed Gray** (pressed): 누르는 동안의 바탕(`:active`). 다크 모드에서는 세그먼트 선택 바탕.
- **Ink** (text): 본문과 제목. 토스트 바탕, 선택된 칩 바탕으로 뒤집어 쓴다.
- **Slate** (text-muted): 설명문, 묶음 제목, 보조 제목.
- **Pebble** (text-subtle): 줄 부제, 면책 문구, 비선택 탭, 아이콘.
- **Placeholder Gray** (placeholder), **Hairline** (border), **Divider** (divider), **Chevron Gray** (chevron): 입력 힌트, 1px 테두리, 줄 사이 구분선, 목록 끝 화살표.

### Named Rules
**The Fixed Meaning Rule.** 빨강은 병용금기, 노랑은 병용주의, 회색은 확인된 충돌 없음 또는 데이터 부족이다. 이 색들을 장식이나 다른 뜻으로 쓰지 않고, 색만으로 뜻을 전하지 않는다(상태 점 옆에 늘 글자, 결과 블록에 늘 아이콘과 문장).

**The Green Is Not Safe Rule.** 충돌 판정에서 초록 "안전" 결과를 만들지 않는다. 충돌이 안 보이면 회색 "확인된 충돌 없음"이다. 초록은 성분 대조처럼 사실 확인이 된 경우에만 쓴다.

**The One Indigo Rule.** 진한 인디고 바탕은 주 버튼과 선택된 탭(아이콘)에만 쓴다. 옅은 인디고(primary-soft)는 아이콘 타일·보조 버튼·정보 띠에 쓸 수 있지만, 선택된 칩은 인디고가 아니라 Ink 반전이다.

## Typography

**Display Font:** Pretendard Variable (with Pretendard, -apple-system, Apple SD Gothic Neo, Malgun Gothic, system-ui)
**Body Font:** 같은 가족

**Character:** 한 가족, 굵기 400·600·700·800으로만 위계를 만든다. 큰 제목은 자간을 -0.02em 조여 앱다운 단단함을 준다. 글꼴은 npm `pretendard`의 dynamic subset을 앱에 포함해 쓴다(외부 CDN 없음).

### Hierarchy
- **Verdict** (800, 30px, 1.25, -0.02em): 결과 블록의 결론 한 문장. 화면당 하나.
- **Large Title** (700, 28px, 1.3, -0.02em): 탭 화면 머리, 상세 화면 제품명.
- **Title** (700, 22px, 1.35): 대화상자 제목, 성분 카드 이름, 빈 상태 제목. 성분 대조 결과 제목은 800.
- **Body** (400, 18px, 1.55): 본문, 버튼(700), 줄 제목(600), 입력. 긴 글(상세·AI 해설)은 줄간격 1.65~1.7.
- **Sub** (400, 16px, 1.5): 설명문, 면책 문구, 안내 띠, 칩·작은 버튼, 보조 제목(700, muted).
- **Label** (600, 15px): 묶음 제목, 탭 이름, 줄 부제(400), 상태 표시(700).
- **Caption** (700, 14px): 꼬리표 글자만.

큰 글씨 모드(`html[data-font-scale='large']`)는 단계를 함께 올린다: 16 / 17 / 19 / 21 / 25 / 32 / 34px, 버튼 64px, 줄 72px. 숫자는 `.num`으로 고정폭 숫자를 쓴다.

### Named Rules
**The 18px Floor Rule.** 읽어야 하는 문장은 18px(큰 글씨 모드 21px) 이상이다. 15px 이하는 라벨·부제·꼬리표처럼 훑어보는 글자에만 쓴다.

**The Unbroken Phrase Rule.** 전체에 `word-break: keep-all`, `text-wrap: pretty`, 제목에 `text-wrap: balance`를 건다. 떨어지면 뜻이 이상해지는 구절은 줄바꿈 없는 공백(NBSP)으로 묶는다("안 돼요", "내 약", "이 화면을", "찾지 못했어요", "상담해 주세요"). "약사·의사"는 가운뎃점 양옆에 U+2060(word joiner)을 넣어 한 덩어리로 둔다.

**The No Ellipsis Rule.** 제품명·약 이름·결과 문장을 말줄임(…)이나 한 줄 자르기로 숨기지 않는다. 길면 줄을 바꿔 끝까지 보인다.

## Layout

한 열 모바일 레이아웃. 본문 폭은 최대 560px로 가운데 정렬하고(데스크톱에서도 휴대폰 폭), 화면 좌우 여백은 20px(pad), 묶음 목록의 좌우 여백은 16px(gutter)이다. 안전 영역(`env(safe-area-inset-*)`)을 위·아래에 반영한다.

- **탭 화면:** 큰 제목 머리(위 24px) → 검색 폼 → 2열 빠른 메뉴 타일(간격 10px) → 묶음 목록들. 묶음 제목은 위 24px, 아래 8px.
- **덮는 화면(결과·상세):** 화면 전체를 덮되 아래쪽은 탭바 높이(64px + 안전 영역)에서 끝나 탭바가 늘 보인다. 맨 위에 sticky 상단 바(56px, 뒤로 버튼 + 제목).
- **하단 고정 버튼 줄:** 탭바 바로 위에 붙고(1px 위 테두리), 버튼 2개를 10px 간격으로 나란히 둔다. 본문은 그만큼 아래 여백을 확보한다.
- **리듬:** 4의 배수 근처(4·8·10·12·16·20·24px). 버튼 사이 10px, 칩 사이 8px.
- 좁은 화면(412dp 갤럭시)에서도 깨지지 않아야 한다.

### Named Rules
**The Tab Bar Stays Rule.** 탭바(높이 64px)는 어떤 덮는 화면에서도 가려지지 않는다. 결과·상세 화면과 하단 고정 버튼 줄은 탭바 위에서 끝난다. 탭바를 덮는 것은 확인 대화상자와 토스트뿐이다.

## Elevation & Depth

거의 평평하다. 깊이는 미색 바탕과 흰 면의 명도 차이에, 따뜻한 갈색 기운의 아주 옅은 그림자(Card)를 더해 만든다. 다크 모드에서는 같은 단계의 그림자를 더 진하게 정의한다.

### Shadow Vocabulary
- **Card** (card-shadow, `0 1px 2px rgba(70,48,24,0.05), 0 6px 18px rgba(70,48,24,0.06)`): 묶음 목록, 접는 원문 묶음, 빠른 메뉴 타일, 입력칸, 홈의 내 약 요약. 다크 모드에서는 투명(그림자가 안 보인다).
- **Rest** (elev-1, `0 1px 2px rgba(25,31,40,0.05)`): 그 밖에 바탕에서 살짝 뜬 정도가 필요한 곳.
- **Raised** (elev-2, `0 2px 8px rgba(25,31,40,0.08)`): 세그먼트 컨트롤의 선택된 칸.
- **Floating** (elev-3, `0 8px 24px rgba(25,31,40,0.12)`): 토스트.
- **Modal** (elev-4, `0 16px 40px rgba(25,31,40,0.18)`): 확인 대화상자. 뒤는 scrim(`rgba(17,20,26,0.48)`).

### Named Rules
**The Soft Card Rule.** 흰 상자는 미색 바탕 위에 Card 그림자 하나로 살짝 뜬다. 결과 상자(빨강, 노랑, 회색)와 빨간 "하지 말 것" 상자는 색으로 구분되므로 그림자를 주지 않는다. 진한 그림자는 떠 있는 물건(토스트·대화상자)에만 쓴다.

## Shapes

부드럽고 큰 모서리. 크기가 클수록 모서리도 크다: 아이콘 타일·작은 버튼 12px, 버튼·입력칸·안내 띠 16px, 묶음 목록·빠른 메뉴 타일·토스트 20px, 결과 블록·대화상자 24px, 칩·꼬리표·원형 아이콘 버튼은 완전한 알약형. 테두리는 1px 구분선과 흰 버튼의 1px 테두리뿐이고, 결과 아이콘·상태 점·단계 번호는 원이다.

## Components

### Buttons
차분하고 꽉 찬 블록. 기본적으로 가로를 다 채운다.
- **Shape:** 16px 모서리, 높이 56px 이상(큰 글씨 64px), 굵기 700, 18px.
- **Primary:** 인디고 바탕 + 흰 글자. hover는 Deep Indigo, 누르면 `scale(0.98)`, 비활성은 투명도 0.45.
- **Secondary:** Indigo Mist 바탕 + Deep Indigo 글자(예: AI 해설).
- **Plain:** 흰 바탕 + 1px 테두리 + Ink 글자.
- **Danger:** 빨강 바탕(다크 모드는 어두운 글자).
- **Small:** 폭 자동, 12px 모서리, 16px 글자. 높이는 여전히 56px.
- **Text button:** 목록 끝 "지우기" 같은 글자 버튼, 56×56px 이상, 다른 버튼과 떨어진 자리에만.
- **Focus:** 모든 요소 공통 3px 인디고 외곽선, 2px 띄움.

### Chips
- **Style:** 흰 바탕, 1px 테두리, 알약형, 높이 56px, 16px/600.
- **State:** 선택(`aria-pressed`)은 Ink 바탕 + 바탕색 글자로 반전. 인디고를 쓰지 않는다.

### Cards / Containers (묶음 목록)
- **Corner Style:** 22px.
- **Background:** 미색 바탕 위 흰 면, Card 그림자.
- **Border:** 없음. 줄 사이 1px 구분선.
- **Row:** 높이 64px 이상(큰 글씨 72px), 안쪽 12px 18px. 왼쪽에 선택적 40px 아이콘 타일(Indigo Mist, 12px), 가운데 제목(18px/600)과 부제(15px), 오른쪽에 상태 표시나 화살표. 누르면 Pressed Gray.
- **상태 표시:** 8px 원형 점 + 글자(15px/700), 결과 색. 줄을 바꾸지 않는다.

### Inputs / Fields
- **Style:** 흰 바탕, 16px 모서리, 높이 60px, 투명한 2px 테두리, Rest 그림자, 왼쪽 24px 아이콘, 오른쪽 56px 지우기 버튼.
- **Focus:** 테두리가 인디고로.
- **Flat variant:** 묶음 안에서는 그림자 없이 Soft Panel 바탕, 높이 56px.

### Navigation
- **하단 탭:** 3개(확인·내 약·설정), 흰 바탕, 위 1px 테두리, 높이 64px, 26px lucide 아이콘 + 15px/600 이름. 비선택은 Pebble, 선택은 이름이 Ink, 아이콘이 인디고. 누르면 Pressed Gray.
- **상단 바:** 덮는 화면에서만. 바탕색 위 sticky, 56px 원형 뒤로 버튼(28px 화살표), 제목 18px/600.

### Verdict Block (signature)
결과 화면의 주인공. 옅은 결과색 바탕, 24px 모서리, 안쪽 24px 22px 22px. 52px 원형 아이콘(진한 결과색 바탕, 흰 선 아이콘: 금기 X, 주의 삼각형, 확인 안 됨 물음표), 그 아래 결론(30px/800, 진한 결과색), 설명(18px), 근거 한 줄(15px/600, "근거: 식약처 DUR …"). 그 아래 "내 약 N개와 비교했어요" 묶음 목록이 약별 상태를 보여 준다.
- **Signature motion:** 블록이 한 번 12px 아래에서 올라오며 나타나고(420ms, `cubic-bezier(0.16,1,0.3,1)`), 140ms 뒤 아이콘 선이 그려진다(520ms stroke draw). `prefers-reduced-motion`에서는 모든 애니메이션·전환이 사실상 0으로 줄어 바로 최종 상태가 보인다.

### Notices, Tags, Dialog, Toast
- **안내 띠:** 16px 모서리, 옅은 결과색(또는 Indigo Mist) 바탕 + -ink 글자 + 22px 아이콘. 왼쪽 색띠 없음.
- **꼬리표:** 26px 알약형, 14px/700, Soft Panel 또는 옅은 인디고·빨강.
- **확인 대화상자:** 가운데, 최대 400px, 24px 모서리, Modal 그림자, 버튼 2개 나란히.
- **토스트:** 화면 위쪽, Ink 바탕에 반전 글자, 20px 모서리, 48px 닫기 버튼.
- **덮는 화면 진입:** 오른쪽 24px에서 밀려 들어옴(240ms). 대화상자는 0.96에서 커지며, 토스트는 위에서 내려온다.

## Do's and Don'ts

### Do:
- **Do** 색·간격·모서리·그림자는 `--pc-*`/`--fs-*` 토큰만 쓰고, 다크 모드와 큰 글씨 모드에서 함께 확인한다.
- **Do** 누르는 모든 자리를 56px 이상(`--pc-button-min-h`, 큰 글씨 64px)으로 만든다. 아이콘 버튼도 56×56px.
- **Do** 결과는 옅은 색 블록 + 원형 아이콘 + 진한 글자로 보여 주고, 상태는 늘 점과 글자를 함께 쓴다.
- **Do** 떨어지면 어색한 구절은 NBSP로, "약사·의사"는 가운뎃점 양옆 U+2060으로 묶는다.
- **Do** 묶음 목록(흰 면, 20px, 줄 구분선)으로 정보를 모으고, 묶음 위에는 짧은 문장형 묶음 제목을 둔다.
- **Do** 아이콘은 lucide 선 아이콘 한 벌만 쓴다.
- **Do** 새 덮는 화면은 탭바 위에서 끝나게 하고, 하단 고정 버튼은 탭바 바로 위에 둔다.

### Don't:
- **Don't** 충돌 판정에서 초록 "안전" 결과를 내거나 "안전하다"고 단정하지 않는다. 충돌이 안 보이면 회색이다.
- **Don't** 결과 색을 장식이나 다른 뜻으로 쓰지 않는다.
- **Don't** 진한 인디고를 주 버튼·선택 탭 외의 강조에 쓰지 않는다.
- **Don't** 카드나 안내 띠에 왼쪽 색띠(border-left 강조)를 넣지 않는다.
- **Don't** 제목 위에 작은 라벨(eyebrow)을 얹지 않는다.
- **Don't** 이모지를 아이콘으로 쓰지 않는다.
- **Don't** 제품명·결과 문장을 말줄임이나 한 줄 자르기로 자르지 않는다.
- **Don't** 웹페이지식으로 그림자 진 카드를 줄줄이 늘어놓지 않는다.
