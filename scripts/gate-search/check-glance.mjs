// 상세 "한눈에 보기" 강조(web/src/lib/xmlDoc.ts의 markDose, isSubheadLine) 검증.
// 강조는 모양만 바꾸고 원문 글자는 바꾸면 안 된다. 네트워크가 필요 없다.
// Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-glance.mjs   → 기대와 다르면 exit 1
import { isSubheadLine, markDose } from '../../web/src/lib/xmlDoc.ts'

let failed = 0
function expect(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
const marks = (line) => markDose(line).filter((p) => p.mark).map((p) => p.text)

// 1) 실제 의약품, 영양제 먹는 법 원문 줄 (2026-11-12~13 식약처 응답에서 옮김)
const dose = [
  ['1회 1~2정씩 1일 3-4회 (4-6시간 마다) 필요시 복용한다.', ['1회 1~2정', '1일 3-4회', '4-6시간']],
  ['1일 최대 4그램 (8정)을 초과하여 복용하지 않는다.', ['1일 최대 4그램', '8정']],
  ['만 12세 이상 소아 및 성인:', ['만 12세']],
  ['성인 1회 30ml 1일 3회 식후 30분에 복용한다.', ['1회 30ml 1일 3회', '30분']],
  ['1일 1회, 1회 1캡슐을 물과 함께 섭취하십시오.', ['1일 1회', '1회 1캡슐']],
  ['보통 초기용량은 와파린나트륨으로서 1일 2～5 mg, 유지용량은 1일 2～10 mg이다.', ['1일 2～5 mg', '1일 2～10 mg']],
  ['성인 1회 1정 1일 3회까지 공복(빈속)시를 피하여 복용한다.', ['1회 1정 1일 3회']],
  ['암로디핀으로서 1일 1회 5mg을 경구투여하며 1일 최고 10 mg까지 증량할 수 있다.', ['1일 1회 5mg', '1일 최고 10 mg']],
  ['성인 : 1회 1정 1일 3회 식후에 복용한다.', ['1회 1정 1일 3회']],
]
for (const [line, want] of dose) expect(`강조 "${line.slice(0, 24)}"`, marks(line), want)

// 2) 숫자가 아닌 곳은 칠하지 않는다
const none = [
  'PT/INR 및 CYP2C9, VKORC1 유전자의 특정 유전형(사용상의 주의사항 중 4. 일반적 주의 참조)에 따라',
  '고령자나 쇠약환자는 적은 용량이 권장된다.',
  '이 약은 가능한 최단기간동안 최소 유효용량으로 복용한다.',
]
for (const line of none) expect(`강조 없음 "${line.slice(0, 24)}"`, marks(line), [])

// 3) 글자를 바꾸지 않는다: 조각을 이어 붙이면 원래 줄과 같다
for (const [line] of dose) expect(`원문 그대로 "${line.slice(0, 16)}"`, markDose(line).map((p) => p.text).join(''), line)
for (const line of none) expect(`원문 그대로 "${line.slice(0, 16)}"`, markDose(line).map((p) => p.text).join(''), line)

// 4) 소제목 줄
const sub = [
  ['1. 주효능·효과', true],
  ['만 12세 이상 소아 및 성인:', true],
  ['<성인>', true],
  ['2. 다음 질환에도 사용할 수 있다.', false],
  ['감기로 인한 발열 및 동통(통증), 두통, 신경통', false],
  ['1회 1~2정씩 1일 3-4회 (4-6시간 마다) 필요시 복용한다.', false],
  ['1) 이 약에 과민증 환자', false], // 목록 항목이지 소제목이 아니다
  ['[나이아신] 체내 에너지 생성에 필요', false],
]
for (const [line, want] of sub) expect(`소제목 "${line}"`, isSubheadLine(line), want)

console.log(failed ? `\n${failed}건 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
