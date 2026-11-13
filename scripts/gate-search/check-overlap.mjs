// 영양제끼리 같은 성분 겹침(web/src/lib/ingredient-alias.ts의 sharedIngredients) 검증.
// 로컬 I0030 실제 신고 재료(RAWMTRL_NM)로 겹치는 조합과 안 겹치는 조합을 확인한다.
// 먼저 download.mjs로 data/를 받아 둔다. Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-overlap.mjs   → 기대와 다르면 exit 1
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './lib.mjs'
import { knownIngredients, sharedIngredients } from '../../web/src/lib/ingredient-alias.ts'

const rows = readdirSync(DATA_DIR)
  .filter((f) => f.startsWith('I0030-'))
  .flatMap((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')))

let failed = 0
function expect(label, actual, want) {
  const ok = actual === want
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (기대 ${want})`}`)
}

/** 이름이 하나뿐인 신고의 주된 재료. 없거나 여럿이면 실패로 센다 */
function raw(name) {
  const hits = rows.filter((r) => r.PRDLST_NM === name)
  if (hits.length !== 1) {
    failed++
    console.log(`FAIL 제품 "${name}" ${hits.length}건 (1건이어야 함)`)
    return undefined
  }
  return hits[0].RAWMTRL_NM
}

// 1) 실제 제품끼리 (2026-11-13 로컬 I0030에서 고름)
const pairs = [
  ['50+멀티비타민미네랄', '3중케어 칼슘마그네슘비타민D', '비타민 D,칼슘,마그네슘'],
  ['88루틴 비타민D3 5000IU', '30데이즈 MSM 비타민D', '비타민 D'],
]
for (const [a, b, want] of pairs) expect(`"${a}" + "${b}"`, sharedIngredients(raw(a), raw(b)).join(','), want)
expect('"한국호간원" + "88루틴 비타민D3 5000IU"', sharedIngredients(raw('한국호간원'), raw('88루틴 비타민D3 5000IU')).join(','), '')
expect('"10억 생유산균 면역비타민D" + "아이원 30 루테인지아잔틴 아스타잔틴 3012"', sharedIngredients(raw('10억 생유산균 면역비타민D'), raw('아이원 30 루테인지아잔틴 아스타잔틴 3012')).join(','), '')

// 2) 별칭표 성분이 없는 제품은 겹침을 찾지 않는다 (dur.ts가 knownIngredients 0개면 건너뜀)
expect('"1프로폴리스" 아는 성분 수', knownIngredients(raw('1프로폴리스')).length, 0)

// 3) 함정: 이름에 칼슘·마그네슘이 들어가도 그 성분이 아닌 첨가물
expect('판토텐산칼슘 + 칼슘', sharedIngredients('판토텐산칼슘, 비타민 C', '칼슘, 비타민 D').join(','), '')
expect('스테아린산마그네슘 + 마그네슘', sharedIngredients('비타민 D, 스테아린산마그네슘', '마그네슘').join(','), '')
expect('비타민 D3 + 비타민D (띄어쓰기 달라도)', sharedIngredients('비타민 D3', '비타민D').join(','), '비타민 D')

// 4) 재료 글이 없으면 빈 결과
expect('재료 없음', sharedIngredients(undefined, '비타민 D').join(','), '')

if (failed) {
  console.log(`\n${failed}건 실패`)
  process.exit(1)
}
console.log('\n모두 통과')
