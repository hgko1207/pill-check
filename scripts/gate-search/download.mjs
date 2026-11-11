// I0030 전체를 1000건씩 내려받아 data/I0030-{n}.json으로 저장한다. 이미 받은 페이지는 건너뛴다.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { foodsafety, DATA_DIR } from './lib.mjs'

const SERVICE = 'I0030'
const PAGE = 1000
mkdirSync(DATA_DIR, { recursive: true })

const { total } = await foodsafety(SERVICE, 1, 1)
const pages = Math.ceil(total / PAGE)
console.log(`total=${total} pages=${pages}`)

for (let p = 0; p < pages; p++) {
  const file = join(DATA_DIR, `${SERVICE}-${String(p).padStart(3, '0')}.json`)
  if (existsSync(file)) continue
  const start = p * PAGE + 1
  const end = Math.min(start + PAGE - 1, total)
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await foodsafety(SERVICE, start, end)
      writeFileSync(file, JSON.stringify(r.rows))
      console.log(`${start}-${end}: ${r.rows.length}건`)
      break
    } catch (e) {
      if (attempt >= 3) throw e
      console.log(`${start}-${end}: 재시도 ${attempt} (${e.message.slice(0, 120)})`)
      await new Promise((ok) => setTimeout(ok, 3000))
    }
  }
}
console.log('완료')
