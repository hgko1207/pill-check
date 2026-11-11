/**
 * 식품안전나라 (foodsafetykorea.go.kr) 건강기능식품 검색 클라이언트.
 *
 * V1.0 fact-check 상태:
 * - URL format `/api/{KEY}/{SERVICE}/json/{START}/{END}/{FILTER}` — 검증됨
 *   (잘못된 키로 호출 시 200 + "인증키가 유효하지 않습니다" alert HTML 반환)
 * - service ID `I0030` — 통용값(여러 튜토리얼 일치). 사용자 키로 첫 호출 시 검증 권장.
 *   다른 ID 필요 시 마이페이지에서 확인 후 SERVICE_HEALTHFOOD 상수 갱신.
 * - 사용자가 식품안전나라 별도 가입(foodsafetykorea.go.kr/api)하고 인증키를
 *   .env의 VITE_FOODSAFETY_API_KEY 에 채우면 영양제 검색 자동 활성화.
 *   비어있으면 graceful fallback (의약품 검색만 사용).
 */

const FOODSAFETY_KEY = import.meta.env.VITE_FOODSAFETY_API_KEY ?? ''

const isDev = import.meta.env.DEV
const BASE = isDev ? '/api/foodsafety' : 'https://openapi.foodsafetykorea.go.kr'

const SERVICE_HEALTHFOOD = 'I0030' // 건강기능식품정보 (검증 후 필요 시 변경)

export interface HealthFoodItem {
  PRDLST_NM?: string // 제품명
  BSSH_NM?: string // 업체명
  PRMS_DT?: string // 허가일자 (YYYYMMDD)
  PRDLST_REPORT_NO?: string // 품목제조번호
  STTEMNT_NO?: string // (옛 필드명) 신고번호
  LCNS_NO?: string // 인허가번호
  PRDT_SHAP_CD_NM?: string // 제품형태 (캡슐/액상 등)
  RAWMTRL_NM?: string // 원료성분명 (성분 매칭에 핵심)
  ETC_RAWMTRL_NM?: string // 기타 원료
  INDIV_RAWMTRL_NM?: string // 개별 원료 (고시형 등)
  CAP_RAWMTRL_NM?: string // 캡슐 원료
  PRIMARY_FNCLTY?: string // 주된 기능성
  IFTKN_ATNT_MATR_CN?: string // 섭취 시 주의사항
  NTK_MTHD?: string // 섭취방법
  POG_DAYCNT?: string // 소비기한
  STDR_STND?: string // 기준규격
  DISPOS?: string // 성상
  FRMLC_MTHD?: string // 포장방법
  HIENG_LNTRT_DVS_NM?: string // 고열량/저영양 구분
  CHILD_CRTFC_YN?: string // 어린이 인증 여부
  LAST_UPDT_DTM?: string // 최종 수정일 (YYYY-MM-DD)
}

export interface DoseLine {
  name: string // 예: '루테인(Lutein)'
  amount: string // 예: '24.754 mg'
  per?: string // 예: '0.348g' (제품 무게당)
}

/** 기준규격(STDR_STND)에서 "이름 : 표시량(값/무게)" 줄을 뽑는다. 하루 섭취량 환산은 하지 않는다. */
export function doseLines(item: HealthFoodItem): DoseLine[] {
  const out: DoseLine[] = []
  for (const raw of (item.STDR_STND ?? '').split(/\r?\n/)) {
    const at = raw.indexOf('표시량')
    const colon = raw.indexOf(':')
    if (at < 0 || colon < 0 || colon > at) continue
    const value = insideParens(raw, at).replace(/^\s*표시량\s*/, '')
    if (!/\d/.test(value)) continue // 예: '표시량(%)' 같은 숫자 없는 칸
    const name = raw
      .slice(0, colon)
      .replace(/^\s*(\(?\d+[).]|[①-⑳])\s*/, '')
      .trim()
    if (!name) continue
    const slash = value.lastIndexOf('/')
    out.push(
      slash > 0
        ? { name, amount: value.slice(0, slash).trim(), per: value.slice(slash + 1).trim() }
        : { name, amount: value.trim() },
    )
  }
  return out
}

const OPEN = '(（[{｛'
const CLOSE = ')）]}｝'

/** "표시량" 바로 뒤 괄호의 짝까지 안쪽 글자 (괄호 안 괄호 허용). 괄호 모양은 신고마다 다르다. */
function insideParens(s: string, at: number): string {
  const m = s.slice(at).match(/^표시량\s*([(（[{｛])/)
  if (!m) return ''
  const start = at + m[0].length
  let depth = 1
  for (let i = start; i < s.length; i++) {
    if (OPEN.includes(s[i])) depth++
    else if (CLOSE.includes(s[i])) depth--
    if (depth === 0) return s.slice(start, i)
  }
  return ''
}

/** 띄어쓰기·"(주)"·주식회사 표기를 뗀 이름 (제품명·업체명 비교용) */
export const normName = (s: string | undefined) => (s ?? '').replace(/\s|\(주\)|주식회사|㈜/g, '')

/**
 * 같은 제품명(띄어쓰기·"(주)"만 다름)을 하나로 묶는다. 제조 공장만 다른 신고가 여러 건이기 때문.
 * 대표는 최종 수정일이 가장 최근인 것, 순서는 처음 나온 순서.
 */
export function groupSameName(items: HealthFoodItem[]): { item: HealthFoodItem; count: number }[] {
  const groups = new Map<string, { item: HealthFoodItem; count: number }>()
  for (const item of items) {
    const key = normName(item.PRDLST_NM)
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { item, count: 1 })
      continue
    }
    g.count++
    if ((item.LAST_UPDT_DTM ?? '') > (g.item.LAST_UPDT_DTM ?? '')) g.item = item
  }
  return [...groups.values()]
}

/** 제품명으로 쇼핑몰 검색 페이지 주소 (가격 API 없음, docs/next-supplement-search.md) */
export function shopSearchUrls(name: string): { naver: string; coupang: string } {
  const q = encodeURIComponent(name)
  return {
    naver: `https://search.shopping.naver.com/search/all?query=${q}`,
    coupang: `https://www.coupang.com/np/search?q=${q}`,
  }
}

interface FoodSafetyResponse<T> {
  [serviceName: string]: {
    total_count?: string
    row?: T[]
    RESULT?: { CODE?: string; MSG?: string }
  }
}

export class FoodSafetyKeyMissingError extends Error {
  constructor() {
    super(
      '식품안전나라 인증키가 설정되지 않아 영양제(건강기능식품)는 검색되지 않습니다. ' +
        'foodsafetykorea.go.kr/api 회원가입 후 키 발급 → .env의 VITE_FOODSAFETY_API_KEY 에 추가.',
    )
    this.name = 'FoodSafetyKeyMissingError'
  }
}

export class FoodSafetyAuthError extends Error {
  constructor() {
    super('식품안전나라 인증키가 유효하지 않습니다. 키 또는 서비스 ID를 확인하세요.')
    this.name = 'FoodSafetyAuthError'
  }
}

export function isFoodSafetyConfigured(): boolean {
  return FOODSAFETY_KEY.length > 0
}

export async function searchHealthFood(
  name: string,
  opts: { rows?: number } = {},
): Promise<HealthFoodItem[]> {
  const filter = `PRDLST_NM=${encodeURIComponent(name)}`
  return fetchService<HealthFoodItem>(SERVICE_HEALTHFOOD, 1, opts.rows ?? 10, filter)
}

/** 식품안전나라 서비스 한 페이지. 결과 코드가 INFO-000이 아니면(INFO-200 = 데이터 없음 등) 빈 배열 */
async function fetchService<T>(
  service: string,
  start: number,
  end: number,
  filter = '',
): Promise<T[]> {
  if (!FOODSAFETY_KEY) throw new FoodSafetyKeyMissingError()
  const url = `${BASE}/api/${FOODSAFETY_KEY}/${service}/json/${start}/${end}${filter ? `/${filter}` : ''}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`식품안전나라 API 응답 오류 (${res.status})`)
  }

  const text = await res.text()

  // 인증키 무효 시 응답이 HTML(<script>alert(...);)로 옴
  if (text.trimStart().startsWith('<')) {
    if (text.includes('인증키')) throw new FoodSafetyAuthError()
    throw new Error(`식품안전나라가 비-JSON 응답을 반환했습니다. 처음 120자: ${text.slice(0, 120)}`)
  }

  let data: FoodSafetyResponse<T>
  try {
    data = JSON.parse(text) as FoodSafetyResponse<T>
  } catch {
    throw new Error(`식품안전나라 JSON 파싱 실패. 처음 120자: ${text.slice(0, 120)}`)
  }

  const body = data[service]
  if (!body) return []

  // 결과 코드 INFO-200 = 데이터 없음 (정상)
  if (body.RESULT?.CODE && body.RESULT.CODE !== 'INFO-000') {
    return []
  }

  return body.row ?? []
}

/* ──────────────── 회수 이력 (I0490) ──────────────── */

const SERVICE_RECALL = 'I0490' // 회수·판매중지 (2026-11-10 기준 391건, 건강기능식품 31건)

export interface RecallItem {
  PRDTNM?: string // 제품명
  BSSHNM?: string // 업체명
  PRDLST_REPORT_NO?: string // 품목보고번호
  RTRVLPRVNS?: string // 회수 사유
  PRDLST_TYPE?: string // 품목 유형 (건강기능식품 등)
}

let recallCache: Promise<RecallItem[]> | null = null

/** 건강기능식품 회수 목록. 한 번 받으면 앱을 닫을 때까지 메모리에 둔다 (실패하면 다음에 다시 시도) */
export function fetchRecalls(): Promise<RecallItem[]> {
  if (!recallCache) {
    recallCache = fetchService<RecallItem>(SERVICE_RECALL, 1, 1000)
      .then((rows) => rows.filter((r) => r.PRDLST_TYPE === '건강기능식품'))
      .catch((e: unknown) => {
        recallCache = null
        throw e
      })
  }
  return recallCache
}

/** 품목보고번호가 같거나, 없으면 제품명+업체가 같은 회수 건 (scripts/gate-search/gate.mjs와 같은 규칙) */
export function findRecall(item: HealthFoodItem, recalls: RecallItem[]): RecallItem | undefined {
  return recalls.find(
    (r) =>
      (!!r.PRDLST_REPORT_NO && r.PRDLST_REPORT_NO === item.PRDLST_REPORT_NO) ||
      (normName(r.PRDTNM) === normName(item.PRDLST_NM) &&
        normName(r.BSSHNM) === normName(item.BSSH_NM)),
  )
}
