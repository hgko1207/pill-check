import type { InteractionResult, InteractionDetail, UnifiedSearchResult } from './types'
import { db, type RegisteredMedication } from './db'

const NEDRUG_KEY = import.meta.env.VITE_NEDRUG_API_KEY ?? ''
const isDev = import.meta.env.DEV
const DUR_BASE = isDev
  ? '/api/nedrug/1471000/DURPrdlstInfoService03'
  : 'https://apis.data.go.kr/1471000/DURPrdlstInfoService03'

interface DurTabooItem {
  DUR_SEQ?: string
  TYPE_NAME?: string
  INGR_KOR_NAME?: string
  INGR_ENG_NAME?: string
  MIX_INGR?: string | null
  ITEM_SEQ?: string
  ITEM_NAME?: string
  PROHBT_CONTENT?: string
}

interface DurResponseBody {
  body?: {
    items?: DurTabooItem | DurTabooItem[]
    totalCount?: number
  }
}

const DUR_SAMPLE_PAGE_SIZE = 1000
const DUR_CACHE_KEY = 'sample'
const DUR_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — DUR 데이터는 자주 안 바뀜

let cachedSample: DurTabooItem[] | null = null
let cacheLoadedAt = 0

async function loadFromIndexedDB(): Promise<DurTabooItem[] | null> {
  try {
    const row = await db.durCache.get(DUR_CACHE_KEY)
    if (!row) return null
    if (Date.now() - row.fetchedAt > DUR_CACHE_TTL_MS) return null
    return row.data as DurTabooItem[]
  } catch {
    return null
  }
}

async function saveToIndexedDB(data: DurTabooItem[]): Promise<void> {
  try {
    await db.durCache.put({ id: DUR_CACHE_KEY, data, fetchedAt: Date.now() })
  } catch {
    /* IDB 쓰기 실패는 치명적 아님 — 다음 세션에 다시 fetch */
  }
}

async function fetchFromApi(): Promise<DurTabooItem[]> {
  if (!NEDRUG_KEY) throw new Error('식약처 API 키가 없습니다.')

  const url =
    `${DUR_BASE}/getUsjntTabooInfoList03` +
    `?serviceKey=${NEDRUG_KEY}` +
    `&type=json` +
    `&numOfRows=${DUR_SAMPLE_PAGE_SIZE}` +
    `&pageNo=1`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`DUR API 응답 오류 (${res.status})`)
  const data = (await res.json()) as DurResponseBody
  const items = data.body?.items ?? []
  return Array.isArray(items) ? items : [items]
}

async function fetchDurSample(): Promise<DurTabooItem[]> {
  // 1단계: 세션 in-memory 캐시 (즉시)
  if (cachedSample && Date.now() - cacheLoadedAt < DUR_CACHE_TTL_MS) {
    return cachedSample
  }

  // 2단계: IndexedDB 영구 캐시 (재방문 시 API 콜 절감)
  const fromIDB = await loadFromIndexedDB()
  if (fromIDB && fromIDB.length > 0) {
    cachedSample = fromIDB
    cacheLoadedAt = Date.now()
    return fromIDB
  }

  // 3단계: API fetch + IDB 저장
  const fresh = await fetchFromApi()
  cachedSample = fresh
  cacheLoadedAt = Date.now()
  void saveToIndexedDB(fresh) // fire-and-forget
  return fresh
}

function lower(s: string | null | undefined): string {
  return (s ?? '').toLowerCase()
}

/**
 * V1.0 매칭 한계:
 * - 식약처 DUR API 검색 파라미터 명세 미확인 (마이페이지 활용가이드 확인 후 정밀화 예정)
 * - 현재 무필터 sample 1000건만 가져와 client-side 매칭
 * - 81만건 중 약 0.1%만 검사하므로 매칭 누락 가능
 *
 * 정책:
 * - 매칭 발견 → 빨강(병용금기) / 노랑(주의)
 * - 매칭 미발견 → 회색 ("데이터 부족, 약사 확인")
 *   초록으로 단정하지 않음 (실제 충돌이 있어도 sample 누락 가능성)
 */
export async function checkInteraction(
  product: UnifiedSearchResult,
  registered: RegisteredMedication[],
): Promise<InteractionResult> {
  if (registered.length === 0) {
    return {
      level: 'unknown',
      title: '등록된 약이 없습니다',
      message: '먼저 부모님이 드시는 약을 등록해주세요. 위쪽 "약 등록" 버튼으로 추가할 수 있습니다.',
    }
  }

  let durSample: DurTabooItem[]
  try {
    durSample = await fetchDurSample()
  } catch {
    return {
      level: 'unknown',
      title: '확인 불가',
      message: 'DUR 데이터를 가져오지 못했습니다. 네트워크 또는 API 키를 확인하시고 약사 선생님께 직접 문의하세요.',
    }
  }

  const productIngrText = lower(product.ingredient)
  const productItemSeq = product.kind === 'drug' ? product.id : ''
  const conflicts: InteractionDetail[] = []

  for (const med of registered) {
    const medIngr = lower(med.mainIngredient)

    for (const dur of durSample) {
      const durItemSeq = dur.ITEM_SEQ
      const durIngr = lower(dur.INGR_KOR_NAME)
      const mixIngr = lower(dur.MIX_INGR)

      // 등록된 약이 DUR row에 매칭되는가? (ITEM_SEQ 또는 성분명)
      const medMatchesDur =
        (durItemSeq && durItemSeq === med.itemSeq) ||
        (medIngr && durIngr && (medIngr.includes(durIngr) || durIngr.includes(medIngr)))

      if (!medMatchesDur) continue

      // 새 제품이 DUR의 MIX_INGR(병용 금기 대상)과 매칭되는가?
      // - 의약품: ITEM_SEQ 또는 MAIN_INGR 텍스트 포함
      // - 영양제: RAWMTRL_NM(원료성분) 텍스트 포함
      const ingrMatch = mixIngr && productIngrText && productIngrText.includes(mixIngr)
      const itemMatch = product.kind === 'drug' && durItemSeq && durItemSeq === productItemSeq
      const productConflictsWithMix = ingrMatch || itemMatch

      if (productConflictsWithMix) {
        const isStrict = (dur.TYPE_NAME ?? '').includes('금기')
        conflicts.push({
          registeredMedName: med.itemName,
          conflictWith: dur.MIX_INGR ?? '(미상)',
          severity: isStrict ? 'danger' : 'warn',
          source: dur.TYPE_NAME ?? 'DUR',
          prohbtContent: dur.PROHBT_CONTENT,
        })
      }
    }
  }

  if (conflicts.length === 0) {
    return {
      level: 'unknown',
      title: '확인된 충돌은 없습니다 (데이터 한계 있음)',
      message:
        '현재 등록하신 약과 이 제품 사이에서 알려진 충돌이 데이터에서 확인되지 않았습니다. ' +
        '단, DUR 검색 정밀도 한계로 누락 가능성이 있어 약사·의사 상담을 권합니다.',
    }
  }

  const hasDanger = conflicts.some((c) => c.severity === 'danger')
  return {
    level: hasDanger ? 'danger' : 'warn',
    title: hasDanger ? '위험 — 함께 드시면 안 됩니다' : '주의가 필요합니다',
    message: hasDanger
      ? '약사 선생님께 반드시 보여주신 후 결정하세요. 자가 판단 금물.'
      : '약사 선생님 상담을 권합니다.',
    details: conflicts,
  }
}
