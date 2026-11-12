// 성분 대조(web/src/lib/ingredient-alias.ts) 검증: 로컬 I0030 데이터로 기대 결과를 확인한다.
// 먼저 download.mjs로 data/를 받아 둔다. Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-ingredients.mjs   → 기대와 다르면 exit 1
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './lib.mjs'
import { INGREDIENTS, findIngredient, matchIngredient, splitRaw } from '../../web/src/lib/ingredient-alias.ts'

const rows = readdirSync(DATA_DIR)
  .filter((f) => f.startsWith('I0030-'))
  .flatMap((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')))

let failed = 0
function expect(label, actual, want) {
  const ok = actual === want
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (기대 ${want})`}`)
}

// 1) 입력 말 → 성분
const queries = [
  ['B-3', 'b3'], ['비피더스 B3', 'b3'], ['비쓰리', 'b3'], ['비타민B3', undefined], ['비피더스', undefined],
  ['루테인', 'lutein'], ['비타민D3', 'vitamin-d'], ['밀크시슬', 'milk-thistle'], ['오메가-3', 'omega3'],
  // 2026-11-12 별칭표 확장: 홍삼은 이제 표에 있다. 표에 없는 말의 예는 노니로 바꿨다
  ['홍삼', 'red-ginseng'], ['노니', undefined], ['프로바이오틱스', 'probiotics'], ['비타민C', 'vitamin-c'],
  ['코큐텐', 'coq10'], ['엠에스엠', 'msm'], ['소팔메토', 'saw-palmetto'],
]
for (const [q, want] of queries) expect(`입력 "${q}"`, findIngredient(q)?.key, want)

// 2) 제품 → 판정 (이름이 같은 신고는 모두 확인)
const cases = [
  ['비피움 비쓰리 다이어트', 'B-3', 'yes'],
  ['쓰리핏 유산균 다이어트', 'B-3', 'yes'], // CJLP133 + B-3 둘 다 신고 (2026-11-11 확인)
  ['다이어트 유산균 비에날씬', 'B-3', 'no'],
  ['아이원 30 루테인지아잔틴 아스타잔틴 3012', '루테인', 'yes'],
  ['한국호간원', '밀크씨슬', 'yes'],
  // 2026-11-12: 홍삼이 표에 들어가 'unknown'이 아니라 'no'다. 표에 없는 말(노니)은 원료 이름 글자 찾기('text-no')
  ['다이어트 유산균 비에날씬', '홍삼', 'no'],
  ['다이어트 유산균 비에날씬', '노니', 'text-no'],
  ['다이어트 유산균 비에날씬', '유산균', 'yes'],
  ['(SS)에스에스혈행솔루션', '은행잎', 'text-yes'],
  // 이름이 비슷한 다른 원료를 잡지 않는지: 판토텐산칼슘(비타민 B5), 메틸테트라히드로엽산글루코사민(엽산), 스테아린산마그네슘(첨가물)
  ['(SS)에스에스혈행솔루션', '칼슘', 'no'],
  ['MTHF-D (엠티에이치에프-디)', '글루코사민', 'no'],
  ['마이핏V멀티비타이뮨128', '마그네슘', 'no'],
]
for (const [name, q, want] of cases) {
  const found = rows.filter((r) => r.PRDLST_NM === name)
  if (found.length === 0) {
    failed++
    console.log(`FAIL ${name}: 데이터에 없음`)
    continue
  }
  for (const r of found) {
    const m = matchIngredient(r, q)
    const detail =
      m.result === 'yes' || m.result === 'text-yes'
        ? m.matched
        : m.result === 'no' || m.result === 'text-no'
          ? m.mainRaw.join(', ')
          : m.reason
    expect(`${name} (${r.PRDLST_REPORT_NO}) × ${q}`, m.result, want)
    console.log(`       → ${detail}`)
  }
}

// 3) 성분별 일치 건수와 일치한 원료 이름 종류 (사람이 훑어보는 용도)
console.log('\n성분별 일치 (기능성 원료 / 기타 원료에만)')
for (const ing of INGREDIENTS) {
  let main = 0
  let etcOnly = 0
  const names = new Map()
  for (const r of rows) {
    const m = matchIngredient(r, ing.label)
    if (m.result !== 'yes') continue
    if (m.etcOnly) etcOnly++
    else main++
    const k = m.matched.replace(/\(.*$/, '').trim().slice(0, 30)
    names.set(k, (names.get(k) ?? 0) + 1)
  }
  const top = [...names].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}(${n})`)
  console.log(`- ${ing.label}: ${main} / ${etcOnly}  원료명: ${top.join(', ')}`)
}

// 4) 괄호 안 쉼표를 나누지 않는지
expect('splitRaw 괄호', splitRaw('A(x, y), B').length, 2)

console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과')
process.exit(failed ? 1 : 0)
