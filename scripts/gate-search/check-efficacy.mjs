// 효능군중복 대조(web/src/lib/dur-match.ts의 findEfficacyDuplicates) 검증 (plan.md 64).
// 행은 2026-11-21 운영 /api/nedrug 중계로 받은 getEfcyDplctInfoList03 실제 행에서 칸만 줄였다. 네트워크와 키가 필요 없다.
// Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-efficacy.mjs   → 기대와 다르면 exit 1
import { findEfficacyDuplicates } from '../../web/src/lib/dur-match.ts'

let failed = 0
function expect(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}

const NSAID = { EFFECT_NAME: '해열진통소염제', SERS_NAME: '비스테로이드성 소염제' }
const rows = [
  { ITEM_SEQ: '199400486', ...NSAID, INGR_NAME: '아세클로페낙', PROHBT_CONTENT: null }, // 에어탈정
  { ITEM_SEQ: '200008591', ...NSAID, INGR_NAME: '아스피린', PROHBT_CONTENT: null }, // 바이엘아스피린정500
  { ITEM_SEQ: '200001368', ...NSAID, INGR_NAME: '덱시부프로펜', PROHBT_CONTENT: null }, // 애니펜정300
  // 같은 효능군, 다른 계열
  { ITEM_SEQ: '199602669', EFFECT_NAME: '해열진통소염제', SERS_NAME: '맥각알칼로이드계 편두통치료제', INGR_NAME: '에르고타민타르타르산염' }, // 크래밍정
  { ITEM_SEQ: '200410512', EFFECT_NAME: '정신신경용제', SERS_NAME: 'SSRI', INGR_NAME: '에스시탈로프람옥살산염' }, // 렉사프로정5
  { ITEM_SEQ: '200710849', EFFECT_NAME: '정신신경용제', SERS_NAME: '치매치료제 (항콜린에스테라제)', INGR_NAME: '갈란타민브롬화수소산염' }, // 타미린서방정24
  // 복합제: 같은 품목에 같은 계열 행 2개 (DUR_SEQ 2704, 2705)
  { ITEM_SEQ: '201701459', EFFECT_NAME: '정신신경용제', SERS_NAME: '도파민성 항파킨슨제 (dopa and dopa 유도체)', INGR_NAME: '레보도파' },
  { ITEM_SEQ: '201701459', EFFECT_NAME: '정신신경용제', SERS_NAME: '도파민성 항파킨슨제 (dopa and dopa 유도체)', INGR_NAME: '레보도파' },
  { ITEM_SEQ: '201701460', EFFECT_NAME: '정신신경용제', SERS_NAME: '도파민성 항파킨슨제 (dopa and dopa 유도체)', INGR_NAME: '레보도파' },
  // 주의 문구가 있는 행
  { ITEM_SEQ: 'opioid-a', EFFECT_NAME: '마약류 아편유사제', SERS_NAME: '부분효능제', PROHBT_CONTENT: '성분이 2개 이상인 경우에도 효능군 중복에 해당' },
  { ITEM_SEQ: 'opioid-b', EFFECT_NAME: '마약류 아편유사제', SERS_NAME: '부분효능제', PROHBT_CONTENT: null },
]
const drug = (id, name) => ({ kind: 'drug', id, name })
const aspirin = drug('200008591', '바이엘아스피린정500밀리그람')
const anipen = drug('200001368', '애니펜정300밀리그램(덱시부프로펜)')
const airtal = drug('199400486', '에어탈정(아세클로페낙)')
const cramming = drug('199602669', '크래밍정')
const lexapro = drug('200410512', '렉사프로정5밀리그람')
const tamirin = drug('200710849', '타미린서방정24밀리그램')
const trilevo = drug('201701459', '트리레보정')
const trilevo2 = drug('201701460', '트리레보정 다른 함량')
const tylenol = drug('202106092', '타이레놀정500') // 효능군 자료에 없음
const lutein = { kind: 'healthfood', id: '201701459', name: '품목코드가 겹치는 영양제' }
const names = (out) => out.map((d) => `${d.registeredMedName}|${d.conflictWith}|${d.severity}|${d.source}`)

// 1) 같은 효능군·같은 계열 → 노랑
expect('애니펜 확인, 내 약 아스피린', names(findEfficacyDuplicates(anipen, [aspirin], rows)), [
  '바이엘아스피린정500밀리그람|해열진통소염제|warn|효능군중복',
])
// 2) 여러 내 약 중 같은 계열만
expect('애니펜 확인, 내 약 아스피린·에어탈·타이레놀·렉사프로', names(findEfficacyDuplicates(anipen, [aspirin, airtal, tylenol, lexapro], rows)), [
  '바이엘아스피린정500밀리그람|해열진통소염제|warn|효능군중복',
  '에어탈정(아세클로페낙)|해열진통소염제|warn|효능군중복',
])
// 3) 같은 효능군, 다른 계열 → 아님 (결정 A)
expect('크래밍(맥각) 확인, 내 약 아스피린(소염제)', names(findEfficacyDuplicates(cramming, [aspirin], rows)), [])
expect('렉사프로(SSRI) 확인, 내 약 타미린(치매약)', names(findEfficacyDuplicates(lexapro, [tamirin], rows)), [])
// 4) 복합제 중복 행 → 한 번만
expect('트리레보 다른 함량 확인, 내 약 트리레보', names(findEfficacyDuplicates(trilevo2, [trilevo], rows)), [
  '트리레보정|정신신경용제|warn|효능군중복',
])
// 5) 같은 품목끼리는 비교하지 않는다
expect('아스피린 확인, 내 약 아스피린', names(findEfficacyDuplicates(aspirin, [aspirin], rows)), [])
// 6) 자료에 없는 약 → 없음
expect('타이레놀 확인, 내 약 아스피린', names(findEfficacyDuplicates(tylenol, [aspirin], rows)), [])
// 7) 영양제는 품목코드가 같아도 보지 않는다
expect('트리레보 확인, 내 약 영양제(코드 겹침)', names(findEfficacyDuplicates(trilevo2, [lutein], rows)), [])
expect('영양제 확인', names(findEfficacyDuplicates(lutein, [trilevo], rows)), [])
// 8) 주의 문구: 확인 제품 쪽이 없으면 내 약 쪽 문구
const op = findEfficacyDuplicates(drug('opioid-b', 'B'), [drug('opioid-a', 'A')], rows)
expect('주의 문구 실림', op.map((d) => d.prohbtContent), ['성분이 2개 이상인 경우에도 효능군 중복에 해당'])

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`)
process.exit(failed === 0 ? 0 : 1)
