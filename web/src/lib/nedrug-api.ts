import type { NedrugItem, NedrugSearchResponse } from './types'

const NEDRUG_KEY = import.meta.env.VITE_NEDRUG_API_KEY ?? ''

// 2026-05 fact-check: Service06 → Service07 (구버전 90일 후 중지). 검증된 endpoint.
const isDev = import.meta.env.DEV
const NEDRUG_BASE = isDev
  ? '/api/nedrug/1471000/DrugPrdtPrmsnInfoService07'
  : 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07'

export class MissingApiKeyError extends Error {
  constructor() {
    super('식약처 API 키가 설정되지 않았습니다. .env 파일에 VITE_NEDRUG_API_KEY를 추가하고 dev 서버를 재시작하세요.')
    this.name = 'MissingApiKeyError'
  }
}

export class NedrugRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'NedrugRequestError'
  }
}

export async function searchDrug(name: string, opts: { rows?: number } = {}): Promise<NedrugItem[]> {
  return fetchDrugs(`item_name=${encodeURIComponent(name)}`, opts.rows ?? 10)
}

/**
 * 상자 바코드(표준코드)로 의약품 찾기. bar_code는 일부만 같아도 걸리므로(2026-11-12 호출 확인:
 * 12자리로도 13자리 제품이 나옴) 응답의 BAR_CODE 목록에 찍은 번호가 그대로 있는 것만 남긴다.
 */
export async function searchDrugByBarcode(code: string): Promise<NedrugItem[]> {
  const items = await fetchDrugs(`bar_code=${encodeURIComponent(code)}`, 10)
  return items.filter((item) => (item.BAR_CODE ?? '').split(',').some((c) => c.trim() === code))
}

async function fetchDrugs(filter: string, rows: number): Promise<NedrugItem[]> {
  if (!NEDRUG_KEY) throw new MissingApiKeyError()
  const url =
    `${NEDRUG_BASE}/getDrugPrdtPrmsnDtlInq06` +
    `?serviceKey=${NEDRUG_KEY}` +
    `&type=json` +
    `&${filter}` +
    `&numOfRows=${rows}` +
    `&pageNo=1`

  const res = await fetch(url)
  if (!res.ok) {
    throw new NedrugRequestError(res.status, `식약처 API 응답 오류 (${res.status})`)
  }

  const text = await res.text()
  let data: NedrugSearchResponse
  try {
    data = JSON.parse(text) as NedrugSearchResponse
  } catch {
    throw new NedrugRequestError(
      res.status,
      `JSON 파싱 실패 — 응답이 XML일 수 있습니다. 인증키 활성화 또는 활용신청 승인 여부 확인. 응답 처음 120자: ${text.slice(0, 120)}`,
    )
  }

  return data.body?.items ?? []
}
