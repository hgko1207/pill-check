// 성분 설명 카드용 요약 JSON 생성 → web/src/data/ingredient-summary.json
// 먼저 download.mjs로 data/를 받아 둔다. 갱신은 수동(월 1회 정도): 다시 받고 이 스크립트를 실행한 뒤 커밋.
// 실행: node scripts/gate-search/ingredient-summary.mjs
//
// - 제품 수: 소비자용 신고 중 이 성분이 기능성 원료인 것의 제품명 개수 (띄어쓰기만 다른 이름은 하나로)
// - 기능성·주의사항: 기능성 원료가 이 성분 하나뿐인 제품들에서 가장 많이 적힌 문구 (복합 제품 문구가 섞이지 않게)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, ROOT } from './lib.mjs'
import { INGREDIENTS, matchIngredient, splitRaw } from '../../web/src/lib/ingredient-alias.ts'

const rows = readdirSync(DATA_DIR)
  .filter((f) => f.startsWith('I0030-'))
  .flatMap((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')))

// gate.mjs excludeReason과 같은 규칙: 원료 납품용, 수출용, 이름 앞 "(구)"
const excluded = (r) =>
  /원료로\s*사용/.test(r.NTK_MTHD ?? '') || /수출/.test(r.PRDLST_NM ?? '') || /^\s*\(구\)/.test(r.PRDLST_NM ?? '')

/** 신고 문구를 항목 배열로: "[원료명]", "(국문)/(영문) …", 번호 표기(①, (가), (1), -)를 떼고 나눈다 */
function toItems(text) {
  const s = (text ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(영문\)[\sA-Za-z.,'’-]*/g, ' ')
    .replace(/\(국문\)/g, ' ')
    .replace(/\s+/g, ' ')
    // 번호 없이 이어 쓴 문장: "…줄 수 있음 유산균 …" → 문장 끝에서 나눈다
    .replace(/(있음|줌)\s+(?=[가-힣])/g, '$1\n')
  return s
    .split(/[①-⑳]|\([가-하]\)|\(\d{1,2}\)|(?:^|\s)-\s|\n/)
    .map((x) =>
      x
        .replace(/^\s*\d{1,2}\)\s*/, '') // "1) …" 번호
        .replace(/영\s*[·･‧]\s*유아/g, '영유아')
        .replace(/\s*[·･‧]\s*/g, ', ') // 화면에 가운뎃점을 쓰지 않는다: "면역력 증진·피로개선" → "면역력 증진, 피로개선"
        .replace(/^[\s,.:]+|[\s,]+$/g, '')
        .trim(),
    )
    .filter((x) => x.length > 1 && /[가-힣]/.test(x)) // 영문 번역 문장은 뺀다
}

function mostCommon(list) {
  const count = new Map()
  for (const items of list) {
    if (items.length === 0) continue
    const k = JSON.stringify(items)
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0]
  return best ? { items: JSON.parse(best[0]), count: best[1] } : { items: [], count: 0 }
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `식품안전나라 I0030 ${rows.length}건`,
  ingredients: {},
}

for (const ing of INGREDIENTS) {
  const hits = rows.filter((r) => {
    if (excluded(r)) return false
    const m = matchIngredient(r, ing.label)
    return m.result === 'yes' && !m.etcOnly
  })
  const names = new Set(hits.map((r) => (r.PRDLST_NM ?? '').replace(/\s/g, '')))
  const single = hits.filter((r) => splitRaw(r.RAWMTRL_NM).length === 1)
  const fn = mostCommon(single.map((r) => toItems(r.PRIMARY_FNCLTY)))
  const caution = mostCommon(single.map((r) => toItems(r.IFTKN_ATNT_MATR_CN)))
  out.ingredients[ing.key] = {
    label: ing.label,
    products: names.size,
    functions: fn.items,
    cautions: caution.items,
  }
  console.log(
    `- ${ing.label}: 제품명 ${names.size}개, 단일원료 ${single.length}건 → 기능성 문구 ${fn.count}건 일치, 주의 문구 ${caution.count}건 일치`,
  )
  console.log(`    기능성: ${fn.items.join(' / ')}`)
  console.log(`    주의: ${caution.items.join(' / ')}`)
}

const dir = join(ROOT, 'web', 'src', 'data')
mkdirSync(dir, { recursive: true })
const file = join(dir, 'ingredient-summary.json')
const json = JSON.stringify(out, null, 2) + '\n'
writeFileSync(file, json)
console.log(`\n저장: web/src/data/ingredient-summary.json (${Buffer.byteLength(json)} bytes)`)
