/**
 * 성분 별칭표 + "이 제품에 그 성분이 들어 있나" 판정.
 * LLM이 아니라 식약처 신고 원료명(RAWMTRL_NM 등) 글자 대조로만 판정한다.
 * import 없이 둔다: scripts/gate-search/check-ingredients.mjs가 Node로 바로 읽는다.
 * 정규식 근거: 로컬 I0030 전체 대조 (2026-11-11, plan.md 2번 결과).
 */

export interface IngredientRaw {
  re: RegExp
  /** 원료 이름에 성분 이름이 없을 때 덧붙이는 설명 */
  note?: string
}

export interface IngredientAlias {
  key: string
  label: string
  /** 사용자가 입력한 말이 이 성분인지 */
  query: RegExp
  /** 신고 원료명에서 이 성분을 찾는 패턴 */
  raw: IngredientRaw[]
}

export const INGREDIENTS: IngredientAlias[] = [
  {
    key: 'b3',
    label: '비피더스 B-3',
    // '비타민 B3'(나이아신)는 제외
    query: /^(?!.*비타민).*(B\s*-?\s*3|비\s*쓰리)/i,
    raw: [{ re: /breve\s*B-?3\b/i }],
  },
  {
    key: 'lutein',
    label: '루테인',
    query: /루테인|lutein/i,
    raw: [
      { re: /루테인|lutein/i },
      // 마리골드꽃추출물 신고 1,528건 중 1,524건이 기준규격에 루테인 표시량을 적었다
      { re: /마리골드/, note: '루테인이 든 원료' },
    ],
  },
  {
    key: 'vitamin-d',
    label: '비타민 D',
    query: /비타민\s*D|vitamin\s*D/i,
    raw: [{ re: /비타민\s*D|vitamin\s*D/i }],
  },
  {
    key: 'milk-thistle',
    label: '밀크씨슬',
    query: /밀크\s*[씨시]슬|실리마린/,
    raw: [{ re: /밀크\s*[씨시]슬|실리마린/ }],
  },
  {
    key: 'omega3',
    label: '오메가3',
    query: /오메가\s*-?\s*3|EPA|DHA/i,
    raw: [{ re: /EPA\s*및\s*DHA/ }, { re: /오메가\s*-?\s*3/ }],
  },
]

export interface RawFields {
  RAWMTRL_NM?: string
  INDIV_RAWMTRL_NM?: string
  ETC_RAWMTRL_NM?: string
}

export type IngredientMatch =
  | { result: 'yes'; label: string; matched: string; note?: string; etcOnly: boolean }
  | { result: 'no'; label: string; mainRaw: string[] }
  | { result: 'unknown'; reason: 'not-in-table' | 'no-raw'; label?: string }

export function findIngredient(query: string): IngredientAlias | undefined {
  const q = query.trim()
  if (!q) return undefined
  return INGREDIENTS.find((ing) => ing.query.test(q))
}

/** 쉼표로 원료를 나눈다. 괄호 안 쉼표는 나누지 않는다. */
export function splitRaw(s: string | undefined): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s ?? '') {
    if ('(（[{'.includes(ch)) depth++
    else if (')）]}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter((x) => x.length > 0)
}

/** 화면용: "(제2013-11호)", "(고시형)" 같은 신고 표기를 뗀다 */
export function cleanRawName(s: string): string {
  return s
    .replace(/\((기능성원료인정)?\s*제?\s*\d{4}\s*-\s*\d+\s*호\)/g, '')
    .replace(/\(고시형\)/g, '')
    .trim()
}

function findIn(pieces: string[], ing: IngredientAlias): { matched: string; note?: string } | null {
  for (const piece of pieces) {
    for (const r of ing.raw) {
      const m = piece.match(r.re)
      if (!m) continue
      // 괄호가 안 닫힌 신고는 원료 여러 개가 한 조각으로 남는다 → 일치한 말만 보여 준다
      const clean = cleanRawName(piece)
      return { matched: clean.length > 50 ? m[0] : clean, note: r.note }
    }
  }
  return null
}

export function matchIngredient(item: RawFields, query: string): IngredientMatch {
  const ing = findIngredient(query)
  if (!ing) return { result: 'unknown', reason: 'not-in-table' }

  const functional = [...splitRaw(item.RAWMTRL_NM), ...splitRaw(item.INDIV_RAWMTRL_NM)]
  const etc = splitRaw(item.ETC_RAWMTRL_NM)
  if (functional.length === 0 && etc.length === 0) {
    return { result: 'unknown', reason: 'no-raw', label: ing.label }
  }

  const hit = findIn(functional, ing)
  if (hit) return { result: 'yes', label: ing.label, ...hit, etcOnly: false }
  const etcHit = findIn(etc, ing)
  if (etcHit) return { result: 'yes', label: ing.label, ...etcHit, etcOnly: true }

  const mainRaw = splitRaw(item.RAWMTRL_NM).map(cleanRawName).slice(0, 3)
  return { result: 'no', label: ing.label, mainRaw }
}
