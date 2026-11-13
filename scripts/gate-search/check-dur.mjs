// DUR 병용금기 매칭(web/src/lib/dur-match.ts) 검증: 식약처 실제 응답으로 기대 결과를 확인한다.
// 키는 web/.env의 VITE_NEDRUG_API_KEY를 이 프로세스 안에서만 읽고, 출력에는 찍지 않는다.
// Node 22.18+/24 (타입 제거로 .ts를 바로 import).
// 실행: node scripts/gate-search/check-dur.mjs   → 기대와 다르면 exit 1
import { loadEnvKey } from './lib.mjs'
import { findDurConflicts } from '../../web/src/lib/dur-match.ts'

const KEY = loadEnvKey('VITE_NEDRUG_API_KEY')
if (!KEY) {
  console.error('web/.env에 VITE_NEDRUG_API_KEY가 없어요')
  process.exit(1)
}
const redact = (s) => String(s).split(KEY).join('***')
const DUR = 'https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03'
const DRUG = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06'
const PAGE = 500 // 1000은 빈 응답 (2026-11-12 확인)

async function getJson(url) {
  const res = await fetch(url)
  const text = await res.text()
  try {
    return JSON.parse(text).body
  } catch {
    throw new Error(redact(`JSON 아님 (${res.status}): ${text.slice(0, 200)}`))
  }
}
const items = (b) => (Array.isArray(b?.items) ? b.items : b?.items ? [b.items] : [])

/** 앱(dur.ts)과 같은 방식: 첫 쪽의 totalCount로 나머지 쪽을 병렬로 받는다 */
async function durRows(itemSeq) {
  const page = (n) => getJson(`${DUR}?serviceKey=${KEY}&type=json&itemSeq=${itemSeq}&numOfRows=${PAGE}&pageNo=${n}`)
  const first = await page(1)
  const total = Number(first?.totalCount ?? 0)
  const rest = []
  for (let n = 2; (n - 1) * PAGE < total; n++) rest.push(page(n))
  const rows = [...items(first), ...(await Promise.all(rest)).flatMap(items)]
  return { rows, total }
}

async function drug(name) {
  const b = await getJson(`${DRUG}?serviceKey=${KEY}&type=json&item_name=${encodeURIComponent(name)}&numOfRows=1&pageNo=1`)
  const it = items(b)[0]
  if (!it) throw new Error(`의약품을 못 찾음: ${name}`)
  return { kind: 'drug', id: it.ITEM_SEQ, name: it.ITEM_NAME, ingredient: it.MAIN_ITEM_INGR }
}

let failed = 0
function expect(label, ok, detail) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
}
const show = (cs) => cs.map((c) => `${c.registeredMedName} x ${c.conflictWith} [${c.source}]`).join(' / ') || '없음'

const norvir = await drug('노비르정')
const simva = await drug('심바로드정20')
const tylenol = await drug('타이레놀정500밀리그람')
console.log(`제품: ${[norvir, simva, tylenol].map((d) => `${d.name}(${d.id}, ${d.ingredient})`).join(', ')}`)

const cache = new Map()
async function check(product, registered) {
  const seqs = [...new Set([...registered, product].filter((s) => s.kind === 'drug').map((s) => s.id))]
  const t0 = Date.now()
  const rows = []
  for (const seq of seqs) {
    if (!cache.has(seq)) {
      const r = await durRows(seq)
      cache.set(seq, r.rows)
      expect(`${seq} 모든 쪽 받기`, r.rows.length === r.total, `${r.rows.length}/${r.total}행, ${Date.now() - t0}ms`)
    }
    rows.push(...cache.get(seq))
  }
  return findDurConflicts(product, registered, rows)
}

// 1) 노비르정 등록 + 심바로드정 확인 → 빨강, 상대 성분 심바스타틴
{
  const cs = await check(simva, [norvir])
  expect(
    '노비르정 등록, 심바로드정 확인',
    cs.length > 0 && cs.every((c) => c.severity === 'danger' && c.registeredMedName === norvir.name) && cs.some((c) => c.conflictWith.includes('심바스타틴')),
    show(cs),
  )
}

// 2) 둘 다 등록 + 심바로드정 다시 확인 → 노비르정 줄에만 빨강, 자기 자신과 비교 없음
{
  const cs = await check(simva, [norvir, simva])
  expect(
    '둘 다 등록, 심바로드정 다시 확인',
    cs.length > 0 && cs.every((c) => c.registeredMedName === norvir.name && c.conflictWith !== '(성분 이름 없음)'),
    show(cs),
  )
}

// 3) 반대 방향: 심바로드정 등록 + 노비르정 확인 → 빨강, 상대 성분 리토나비르
{
  const cs = await check(norvir, [simva])
  expect(
    '심바로드정 등록, 노비르정 확인',
    cs.length > 0 && cs.every((c) => c.registeredMedName === simva.name) && cs.some((c) => c.conflictWith.includes('리토나비르')),
    show(cs),
  )
}

// 4) 충돌 없는 조합 → 없음(회색)
{
  const cs = await check(tylenol, [simva])
  expect('심바로드정 등록, 타이레놀 확인', cs.length === 0, show(cs))
}

// 5) 영양제: 원료 글에 상대 성분 이름이 없으면 충돌 없음
{
  const food = { kind: 'healthfood', id: 'test-food', name: '시험 영양제', ingredient: '비타민C, 아연, 덱스트린' }
  const cs = await check(food, [norvir])
  expect('노비르정 등록, 비타민C 영양제 확인', cs.length === 0, show(cs))
}

console.log(failed ? `\n${failed}건 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
