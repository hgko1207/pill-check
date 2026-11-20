import type { NedrugItem, NedrugSearchResponse } from './types'
import { fetchWithTimeout, isTimeoutError } from './fetch-timeout'

// 2026-05 fact-check: Service06 → Service07 (구버전 90일 후 중지). 검증된 endpoint.
// dev는 Vite 프록시, 배포본은 Cloudflare Pages Function(functions/api/nedrug)이 같은 경로를 받아 키를 붙인다
const NEDRUG_BASE = '/api/nedrug/1471000/DrugPrdtPrmsnInfoService07'

export class NedrugRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'NedrugRequestError'
  }
}

/** 검색 한 쪽: 받은 품목과 전체 건수 (전체가 더 많으면 화면이 "일부만 보여요"를 띄운다, plan.md 62) */
export interface DrugSearchPage {
  items: NedrugItem[]
  total: number
}

export async function searchDrug(name: string, opts: { rows?: number } = {}): Promise<DrugSearchPage> {
  return fetchDrugs(`item_name=${encodeURIComponent(name)}`, opts.rows ?? 10)
}

/**
 * 상자 바코드(표준코드)로 의약품 찾기. bar_code는 일부만 같아도 걸리므로(2026-11-12 호출 확인:
 * 12자리로도 13자리 제품이 나옴) 응답의 BAR_CODE 목록에 찍은 번호가 그대로 있는 것만 남긴다.
 */
export async function searchDrugByBarcode(code: string): Promise<NedrugItem[]> {
  const { items } = await fetchDrugs(`bar_code=${encodeURIComponent(code)}`, 10)
  return items.filter((item) => (item.BAR_CODE ?? '').split(',').some((c) => c.trim() === code))
}

async function fetchDrugs(filter: string, rows: number): Promise<DrugSearchPage> {
  const url =
    `${NEDRUG_BASE}/getDrugPrdtPrmsnDtlInq06` +
    `?type=json` +
    `&${filter}` +
    `&numOfRows=${rows}` +
    `&pageNo=1`

  let res: Response
  try {
    res = await fetchWithTimeout(url)
  } catch (e) {
    if (isTimeoutError(e)) throw new NedrugRequestError(504, '식약처 API 응답 시간 초과')
    throw e
  }
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

  // 결과 코드가 정상이 아니면 "결과 없음"이 아니라 실패다. 502로 던져 "식약처 서버가 잠시 응답하지 않아요"로 안내한다
  const code = data.header?.resultCode
  if (code && code !== '00') {
    throw new NedrugRequestError(502, `식약처 API 결과 코드 ${code} ${data.header?.resultMsg ?? ''}`.trim())
  }
  const items = data.body?.items ?? []
  return { items, total: Number(data.body?.totalCount ?? items.length) }
}
