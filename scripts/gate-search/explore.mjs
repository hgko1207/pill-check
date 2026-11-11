// 내려받은 I0030에서 필드 분포와 성분 매칭 후보를 살펴본다 (네트워크 없음).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './lib.mjs'

export function loadAll() {
  return readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('I0030-'))
    .flatMap((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')))
}

const rows = loadAll()
const count = (fn) => {
  const m = new Map()
  for (const r of rows) {
    const k = fn(r)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

console.log('rows', rows.length)
console.log('PRODUCTION', count((r) => r.PRODUCTION))
console.log('원료용(NTK_MTHD에 "원료")', rows.filter((r) => /원료/.test(r.NTK_MTHD ?? '')).length)
console.log('LAST_UPDT 연도', count((r) => (r.LAST_UPDT_DTM ?? '').slice(0, 4)).slice(0, 12))
console.log('PRMS_DT 연도', count((r) => (r.PRMS_DT ?? '').slice(0, 4)).slice(0, 12))
console.log('PRDLST_CDNM 상위', count((r) => r.PRDLST_CDNM).slice(0, 15))

const ING = {
  '비피더스 B-3': /breve\s*B-?3\b|브레베\s*B-?3|비피더스\s*B-?3/i,
  루테인: /루테인|lutein/i,
  '비타민 D': /비타민\s*D|vitamin\s*D/i,
  밀크씨슬: /밀크\s*씨슬|밀크시슬|milk\s*thistle|실리마린/i,
  오메가3: /오메가\s*-?3|EPA|DHA/i,
}
const FIELDS = ['PRDLST_NM', 'RAWMTRL_NM', 'INDIV_RAWMTRL_NM', 'ETC_RAWMTRL_NM', 'CAP_RAWMTRL_NM', 'PRIMARY_FNCLTY', 'STDR_STND']
for (const [name, re] of Object.entries(ING)) {
  const by = FIELDS.map((f) => `${f}=${rows.filter((r) => re.test(r[f] ?? '')).length}`)
  console.log(`\n## ${name}: ${by.join(' ')}`)
  const hit = rows.filter((r) => re.test(r.RAWMTRL_NM ?? '') || re.test(r.INDIV_RAWMTRL_NM ?? ''))
  for (const r of hit.slice(0, 3)) {
    console.log(`  - ${r.PRDLST_NM} / ${r.BSSH_NM} / PROD=${r.PRODUCTION} / 원료: ${(r.RAWMTRL_NM ?? '').slice(0, 80)}`)
    const std = (r.STDR_STND ?? '').split(/\n/).filter((l) => re.test(l) || /표시량/.test(l)).slice(0, 2)
    for (const l of std) console.log(`      규격: ${l.slice(0, 120)}`)
  }
}
