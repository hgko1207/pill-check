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
}

interface FoodSafetyResponse {
  [serviceName: string]: {
    total_count?: string
    row?: HealthFoodItem[]
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
  if (!FOODSAFETY_KEY) throw new FoodSafetyKeyMissingError()
  const start = 1
  const end = opts.rows ?? 10
  const filter = `PRDLST_NM=${encodeURIComponent(name)}`
  const url = `${BASE}/api/${FOODSAFETY_KEY}/${SERVICE_HEALTHFOOD}/json/${start}/${end}/${filter}`

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

  let data: FoodSafetyResponse
  try {
    data = JSON.parse(text) as FoodSafetyResponse
  } catch {
    throw new Error(`식품안전나라 JSON 파싱 실패. 처음 120자: ${text.slice(0, 120)}`)
  }

  const service = data[SERVICE_HEALTHFOOD]
  if (!service) return []

  // 결과 코드 INFO-200 = 데이터 없음 (정상)
  if (service.RESULT?.CODE && service.RESULT.CODE !== 'INFO-000') {
    return []
  }

  return service.row ?? []
}
