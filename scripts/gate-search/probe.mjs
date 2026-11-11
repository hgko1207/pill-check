// 첫 호출: 서비스별 전체 건수, 실제 필드 이름, 성분 필터가 되는지 확인한다.
// 실행: node scripts/gate-search/probe.mjs [서비스ID...]
import { foodsafety, hasKey } from './lib.mjs'

if (!hasKey()) {
  console.log('web/.env에 VITE_FOODSAFETY_API_KEY가 비어 있다')
  process.exit(1)
}

const services = process.argv.slice(2)
if (services.length === 0) services.push('I0030')

const cut = (v) => (typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : v)

for (const svc of services) {
  console.log(`\n=== ${svc} ===`)
  try {
    const r = await foodsafety(svc, 1, 1)
    console.log(`total=${r.total} code=${r.code} msg=${r.msg}`)
    if (r.rows[0]) {
      for (const [k, v] of Object.entries(r.rows[0])) console.log(`  ${k}: ${cut(v)}`)
    }
  } catch (e) {
    console.log(`실패: ${e.message}`)
  }
}
