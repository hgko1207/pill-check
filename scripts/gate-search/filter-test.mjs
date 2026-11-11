// 성분 이름으로 API가 직접 걸러 주는지 필드별로 시험한다.
import { foodsafety } from './lib.mjs'

const fields = ['RAWMTRL_NM', 'INDIV_RAWMTRL_NM', 'PRIMARY_FNCLTY', 'PRDLST_NM', 'PRODUCTION']
const values = { PRODUCTION: ['아니오', '예'] }
const words = ['루테인', '밀크씨슬', '비타민D', '비타민 D', 'B-3', '오메가']

for (const f of fields) {
  for (const w of values[f] ?? words) {
    try {
      const r = await foodsafety('I0030', 1, 3, `${f}=${encodeURIComponent(w)}`)
      const sample = r.rows.map((x) => `${x.PRDLST_NM} / ${x.BSSH_NM}`).join(' | ')
      console.log(`${f}=${w}: total=${r.total} ${r.code} ${sample}`)
    } catch (e) {
      console.log(`${f}=${w}: 실패 ${e.message}`)
    }
  }
}
