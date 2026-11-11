// 2단계 가능성 시험: 성분 → 식약처 제품 상위 10개 → RESULT.md
// 먼저 download.mjs로 I0030 전체를 받아 둔다. 회수 정보(I0490)는 여기서 받는다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, foodsafety } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// 성분별: 원료명 매칭(re), 대표 품목 매칭(main), 기준규격에서 함량 줄을 찾는 패턴(dose)
const INGREDIENTS = [
  { name: '비피더스 B-3', re: /breve\s*B-?3\b/i, main: /breve\s*B-?3\b/i, title: /비피더스|B-?3/i, dose: /비피더스균|프로바이오틱스/ },
  { name: '루테인', re: /루테인/, main: /루테인|마리골드/, title: /루테인/, dose: /루테인/ },
  { name: '비타민 D', re: /비타민\s*D/, main: /^비타민\s*D$/, title: /비타민\s*D|D3/i, dose: /비타민\s*D/ },
  { name: '밀크씨슬', re: /밀크\s*씨슬/, main: /밀크씨슬/, title: /밀크\s*씨슬|간/, dose: /실리마린/ },
  { name: '오메가3', re: /EPA\s*및\s*DHA/, main: /EPA\s*및\s*DHA/, title: /오메가/, dose: /EPA|DHA/ },
]

const rows = readdirSync(DATA_DIR)
  .filter((f) => f.startsWith('I0030-'))
  .flatMap((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')))

const recall = await foodsafety('I0490', 1, 1000)
const recallRows = recall.rows.filter((r) => r.PRDLST_TYPE === '건강기능식품')
const norm = (s) => (s ?? '').replace(/\s|\(주\)|주식회사|㈜/g, '')
function findRecall(r) {
  return recallRows.find(
    (x) =>
      (x.PRDLST_REPORT_NO && x.PRDLST_REPORT_NO === r.PRDLST_REPORT_NO) ||
      (norm(x.PRDTNM) === norm(r.PRDLST_NM) && norm(x.BSSHNM) === norm(r.BSSH_NM)),
  )
}

// 소비자용이 아닌 품목: 원료 납품용, 수출 전용, 이름 앞 "(구)"
function excludeReason(r) {
  if (/원료로\s*사용/.test(r.NTK_MTHD ?? '')) return '원료용'
  if (/수출/.test(r.PRDLST_NM ?? '')) return '수출용'
  if (/^\s*\(구\)/.test(r.PRDLST_NM ?? '')) return '(구)'
  return ''
}

function doseLine(r, re) {
  const line = (r.STDR_STND ?? '').split(/\r?\n/).find((l) => re.test(l) && /표시량|일일섭취량/.test(l))
  if (!line) return ''
  const m = line.match(/표시량[^(（{]*[(（{]\s*([^)）}]+)/)
  return (m ? m[1] : line).replace(/\s+/g, ' ').trim().slice(0, 40)
}

const link = (base, q) => base + encodeURIComponent(q)
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

let md = `# 2단계 가능성 시험 결과\n\n`
md += `- 생성: ${new Date().toISOString().slice(0, 10)}, 스크립트: \`node scripts/gate-search/gate.mjs\`\n`
md += `- 데이터: 식품안전나라 I0030 ${rows.length}건, 회수 I0490 건강기능식품 ${recallRows.length}건\n`
md += `- 정렬(시험용, 품질 순위 아님): 제품명에 성분이 있음 > 대표 품목(PRDLST_CDNM)이 그 성분 → 최종 수정일 최신순. 같은 제품명은 1개만\n`
md += `- 제외: 원료 납품용, 수출용, 이름이 "(구)"로 시작\n`
md += `- "업체"는 신고한 **제조업체**다 (판매 브랜드와 다를 수 있음)\n\n`

const summary = []
for (const ing of INGREDIENTS) {
  const matched = rows.filter((r) => ing.re.test(r.RAWMTRL_NM ?? '') || ing.re.test(r.INDIV_RAWMTRL_NM ?? ''))
  const excluded = {}
  const consumer = matched.filter((r) => {
    const why = excludeReason(r)
    if (why) excluded[why] = (excluded[why] ?? 0) + 1
    return !why
  })
  const isMain = (r) => ing.main.test(r.PRDLST_CDNM ?? '')
  const mainCount = consumer.filter(isMain).length
  // 제품명에 성분이 있으면 2점, 대표 품목이 그 성분이면 1점
  const rank = (r) => (ing.title.test(r.PRDLST_NM ?? '') ? 2 : 0) + (isMain(r) ? 1 : 0)
  const sorted = [...consumer].sort(
    (a, b) => rank(b) - rank(a) || (b.LAST_UPDT_DTM ?? '').localeCompare(a.LAST_UPDT_DTM ?? ''),
  )
  const seen = new Set()
  const top = []
  for (const r of sorted) {
    const k = norm(r.PRDLST_NM)
    if (seen.has(k)) continue
    seen.add(k)
    top.push(r)
    if (top.length === 10) break
  }
  const withDose = top.filter((r) => doseLine(r, ing.dose)).length
  const recalled = consumer.filter(findRecall).length
  summary.push({ name: ing.name, matched: matched.length, consumer: consumer.length, mainCount, withDose, recalled })

  md += `## ${ing.name}\n\n`
  md += `원료 매칭 ${matched.length} → 소비자용 ${consumer.length} (제외 ${JSON.stringify(excluded)}) → 주성분 제품 ${mainCount}. 상위 10개 중 함량 읽힘 ${withDose}. 회수 이력 ${recalled}건\n\n`
  md += `| # | 제품명 | 업체(제조) | 대표 품목 | 함량(표시량) | 최종 수정 | 회수 | 가격 보기 | 판매 중? (사용자 확인) |\n|---|---|---|---|---|---|---|---|---|\n`
  top.forEach((r, i) => {
    const q = r.PRDLST_NM
    const rc = findRecall(r)
    md += `| ${i + 1} | ${esc(r.PRDLST_NM)} | ${esc(r.BSSH_NM)} | ${esc(r.PRDLST_CDNM)} | ${esc(doseLine(r, ing.dose)) || '읽지 못함'} | ${r.LAST_UPDT_DTM ?? ''} | ${rc ? '**있음** ' + esc(rc.RTRVLPRVNS) : '없음'} | [네이버](${link('https://search.shopping.naver.com/search/all?query=', q)}) · [쿠팡](${link('https://www.coupang.com/np/search?q=', q)}) |  |\n`
  })
  md += `\n`
}

md += `## 요약\n\n| 성분 | 원료 매칭 | 소비자용 | 주성분 제품 | 상위 10개 중 함량 읽힘 | 회수 이력 |\n|---|---|---|---|---|---|\n`
for (const s of summary) md += `| ${s.name} | ${s.matched} | ${s.consumer} | ${s.mainCount} | ${s.withDose}/10 | ${s.recalled} |\n`

writeFileSync(join(HERE, 'RESULT.md'), md)
console.log(md.split('## 요약')[1])
