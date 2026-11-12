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
  // 아래는 2026-11-12 추가: 로컬 I0030 기능성 원료 빈도 상위 중 TV·광고에 자주 나오는 것
  {
    key: 'red-ginseng',
    label: '홍삼',
    query: /홍삼/,
    raw: [{ re: /홍삼/ }],
  },
  {
    key: 'probiotics',
    label: '유산균',
    query: /유산균|프로바이오틱스|락토/,
    raw: [{ re: /프로바이오틱스|유산균|락토바실|비피도박테리|lactobacillus|bifidobacterium/i }],
  },
  {
    key: 'vitamin-c',
    label: '비타민 C',
    query: /비타민\s*C|vitamin\s*C/i,
    raw: [{ re: /비타민\s*C|vitamin\s*C/i }],
  },
  {
    key: 'calcium',
    label: '칼슘',
    query: /칼슘/,
    // 판토텐산칼슘(비타민 B5), 스테아린산칼슘·카복시메틸셀룰로스칼슘(첨가물)은 칼슘 원료가 아니다
    raw: [{ re: /(?<!(판토텐산|스테아린산|셀룰로스|셀룰로오스)\s*)칼슘/ }],
  },
  {
    key: 'magnesium',
    label: '마그네슘',
    query: /마그네슘/,
    // 스테아린산마그네슘은 알약을 만들 때 쓰는 첨가물
    raw: [{ re: /(?<!스테아린산\s*)마그네슘/ }],
  },
  {
    key: 'zinc',
    label: '아연',
    query: /아연/,
    raw: [{ re: /아연/ }],
  },
  {
    key: 'coq10',
    label: '코엔자임Q10',
    query: /코엔자임|코큐텐|CoQ\s*10/i,
    raw: [{ re: /코엔자임\s*Q\s*10|CoQ\s*10/i }],
  },
  {
    key: 'msm',
    label: 'MSM',
    query: /MSM|엠에스엠|식이유황|메틸설포닐메탄/i,
    raw: [{ re: /MSM|엠에스엠|식이유황|메틸설포닐메탄/i }],
  },
  {
    key: 'saw-palmetto',
    label: '쏘팔메토',
    query: /[쏘소]\s*팔메토/,
    raw: [{ re: /[쏘소]\s*팔메토/ }],
  },
  {
    key: 'garcinia',
    label: '가르시니아',
    query: /가르시니아/,
    raw: [{ re: /가르시니아/ }],
  },
  {
    key: 'collagen',
    label: '콜라겐',
    query: /콜라겐/,
    raw: [{ re: /콜라겐/ }],
  },
  {
    key: 'glucosamine',
    label: '글루코사민',
    query: /글루코사민/,
    // N-아세틸글루코사민(NAG), 메틸테트라히드로엽산글루코사민(엽산)은 다른 원료다
    raw: [{ re: /(?<!(아세틸|엽산)\s*)글루코사민/ }],
  },
  {
    key: 'boswellia',
    label: '보스웰리아',
    query: /보스웰리아/,
    raw: [{ re: /보스웰리아/ }],
  },
  {
    key: 'hyaluronic',
    label: '히알루론산',
    query: /히알루론산/,
    raw: [{ re: /히알루론산/ }],
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
  /** 별칭표에 없는 말: 원료 이름에서 글자 그대로 찾은 결과. 다른 이름으로 신고됐을 수 있어 "없다"고 단정하지 않는다 */
  | { result: 'text-yes'; asked: string; matched: string; etcOnly: boolean }
  | { result: 'text-no'; asked: string; mainRaw: string[] }
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

/** 띄어쓰기와 대소문자를 무시하고 원료 이름에 그 글자가 있는지 */
function findText(pieces: string[], asked: string): string | null {
  const norm = (x: string) => x.replace(/\s/g, '').toLowerCase()
  const q = norm(asked)
  for (const piece of pieces) {
    if (!norm(piece).includes(q)) continue
    const clean = cleanRawName(piece)
    return clean.length > 50 ? asked : clean
  }
  return null
}

export function matchIngredient(item: RawFields, query: string): IngredientMatch {
  const ing = findIngredient(query)
  const asked = query.trim()
  if (!ing && asked.replace(/\s/g, '').length < 2) return { result: 'unknown', reason: 'not-in-table' }

  const functional = [...splitRaw(item.RAWMTRL_NM), ...splitRaw(item.INDIV_RAWMTRL_NM)]
  const etc = splitRaw(item.ETC_RAWMTRL_NM)
  if (functional.length === 0 && etc.length === 0) {
    return { result: 'unknown', reason: 'no-raw', label: ing?.label }
  }
  const mainRaw = splitRaw(item.RAWMTRL_NM).map(cleanRawName).slice(0, 3)

  if (!ing) {
    const text = findText(functional, asked)
    if (text) return { result: 'text-yes', asked, matched: text, etcOnly: false }
    const etcText = findText(etc, asked)
    if (etcText) return { result: 'text-yes', asked, matched: etcText, etcOnly: true }
    return { result: 'text-no', asked, mainRaw }
  }

  const hit = findIn(functional, ing)
  if (hit) return { result: 'yes', label: ing.label, ...hit, etcOnly: false }
  const etcHit = findIn(etc, ing)
  if (etcHit) return { result: 'yes', label: ing.label, ...etcHit, etcOnly: true }

  return { result: 'no', label: ing.label, mainRaw }
}
