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

const DUR_PAGE_SIZE = 200 // 한 약의 DUR row는 보통 수십개 — 200이면 충분
const DUR_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — DUR 데이터는 자주 안 바뀜

/** in-memory cache: itemSeq → DurTabooItem[] */
const memCache = new Map<string, { data: DurTabooItem[]; loadedAt: number }>()

function cacheKey(itemSeq: string): string {
  return `itemSeq:${itemSeq}`
}

async function loadFromIDB(itemSeq: string): Promise<DurTabooItem[] | null> {
  try {
    const row = await db.durCache.get(cacheKey(itemSeq))
    if (!row) return null
    if (Date.now() - row.fetchedAt > DUR_CACHE_TTL_MS) return null
    return row.data as DurTabooItem[]
  } catch {
    return null
  }
}

async function saveToIDB(itemSeq: string, data: DurTabooItem[]): Promise<void> {
  try {
    await db.durCache.put({ id: cacheKey(itemSeq), data, fetchedAt: Date.now() })
  } catch {
    /* IDB 실패는 치명적 아님 */
  }
}

async function fetchDurFromApi(itemSeq: string): Promise<DurTabooItem[]> {
  if (!NEDRUG_KEY) throw new Error('식약처 API 키가 없습니다.')

  const url =
    `${DUR_BASE}/getUsjntTabooInfoList03` +
    `?serviceKey=${NEDRUG_KEY}` +
    `&type=json` +
    `&itemSeq=${encodeURIComponent(itemSeq)}` +
    `&numOfRows=${DUR_PAGE_SIZE}` +
    `&pageNo=1`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`DUR API 응답 오류 (${res.status})`)
  const data = (await res.json()) as DurResponseBody
  const items = data.body?.items ?? []
  return Array.isArray(items) ? items : [items]
}

/**
 * 특정 약의 DUR row 가져오기 (memory → IDB → API)
 * - itemSeq 기준으로 그 약이 primary 또는 counterpart인 DUR row만 반환
 * - 빈 결과도 24h 캐싱 (재호출 절감)
 */
async function fetchDurForItemSeq(itemSeq: string): Promise<DurTabooItem[]> {
  if (!itemSeq) return []

  // 1단계: in-memory
  const mem = memCache.get(itemSeq)
  if (mem && Date.now() - mem.loadedAt < DUR_CACHE_TTL_MS) {
    return mem.data
  }

  // 2단계: IndexedDB
  const fromIDB = await loadFromIDB(itemSeq)
  if (fromIDB) {
    memCache.set(itemSeq, { data: fromIDB, loadedAt: Date.now() })
    return fromIDB
  }

  // 3단계: API
  const fresh = await fetchDurFromApi(itemSeq)
  memCache.set(itemSeq, { data: fresh, loadedAt: Date.now() })
  void saveToIDB(itemSeq, fresh)
  return fresh
}

function lower(s: string | null | undefined): string {
  return (s ?? '').toLowerCase()
}

/** DUR row 중복 제거용 키 */
function durDedupKey(d: DurTabooItem): string {
  return d.DUR_SEQ ?? `${d.ITEM_SEQ ?? ''}|${d.INGR_KOR_NAME ?? ''}|${d.MIX_INGR ?? ''}`
}

/**
 * V1.1 매칭 정밀도 (옵션 A):
 * - 등록된 약 + 새 제품 각각의 itemSeq로 DUR API 타겟 쿼리
 * - 81만건 전체 검색은 불가능하지만 관련된 row만 정확히 가져옴 → 매칭 누락 거의 없음
 * - itemSeq별 IDB 캐시 24h — 두 번째부터 즉시
 *
 * 한계:
 * - 영양제(healthfood)는 itemSeq가 식약처 약 코드가 아니므로 그쪽 query는 스킵
 *   대신 등록된 약의 DUR row 안에서 MIX_INGR(원료/성분)이 영양제 원료와 매칭되는지 확인
 *   (예: 와파린 등록 → 와파린 DUR에 비타민K 금기 → 비타민K 영양제 검사 시 적중)
 * - 매칭 미발견 → 회색 ("데이터 부족"), 초록으로 단정 안 함
 */
export async function checkInteraction(
  product: UnifiedSearchResult,
  registered: RegisteredMedication[],
): Promise<InteractionResult> {
  if (registered.length === 0) {
    return {
      level: 'unknown',
      title: '등록된 약이 없어요',
      message: '먼저 드시는 약을 등록해 주세요. 검색 결과에서 "내 약에 등록"을 누르면 돼요.',
    }
  }

  // 1) 검사 대상 itemSeq 모으기: 등록된 drug + 새 제품(drug인 경우)
  const itemSeqsToQuery = new Set<string>()
  for (const med of registered) {
    if (med.kind === 'drug' && med.itemSeq) itemSeqsToQuery.add(med.itemSeq)
  }
  if (product.kind === 'drug' && product.id) itemSeqsToQuery.add(product.id)

  // 2) 병렬로 DUR row fetch (캐시 히트 시 즉시)
  const fetchResults = await Promise.allSettled(
    [...itemSeqsToQuery].map((seq) => fetchDurForItemSeq(seq)),
  )

  // 모두 실패하면 네트워크/키 문제 — 안전하게 unknown
  const successCount = fetchResults.filter((r) => r.status === 'fulfilled').length
  if (successCount === 0 && itemSeqsToQuery.size > 0) {
    return {
      level: 'unknown',
      title: '지금은 확인할 수 없어요',
      message: '식약처 자료를 받아 오지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 보시고, 급하면 약사에게 직접 물어보세요.',
    }
  }

  // 3) 모든 결과 dedup 합산
  const allRows = new Map<string, DurTabooItem>()
  for (const r of fetchResults) {
    if (r.status === 'fulfilled') {
      for (const row of r.value) allRows.set(durDedupKey(row), row)
    }
  }

  // 4) 매칭 — 기존 로직 그대로
  const productIngrText = lower(product.ingredient)
  const productItemSeq = product.kind === 'drug' ? product.id : ''
  const conflicts: InteractionDetail[] = []
  const seen = new Set<string>() // 중복 conflict 방지

  for (const med of registered) {
    const medIngr = lower(med.mainIngredient)

    for (const dur of allRows.values()) {
      const durItemSeq = dur.ITEM_SEQ
      const durIngr = lower(dur.INGR_KOR_NAME)
      const mixIngr = lower(dur.MIX_INGR)

      // 등록된 약이 이 DUR row에 매칭되는가?
      const medMatchesDur =
        (durItemSeq && durItemSeq === med.itemSeq) ||
        (medIngr && durIngr && (medIngr.includes(durIngr) || durIngr.includes(medIngr)))

      if (!medMatchesDur) continue

      // 새 제품이 MIX_INGR 또는 ITEM_SEQ와 매칭되는가?
      const ingrMatch = mixIngr && productIngrText && productIngrText.includes(mixIngr)
      const itemMatch = product.kind === 'drug' && durItemSeq && durItemSeq === productItemSeq
      const productConflictsWithMix = ingrMatch || itemMatch

      if (productConflictsWithMix) {
        const isStrict = (dur.TYPE_NAME ?? '').includes('금기')
        const dedup = `${med.itemSeq}|${dur.MIX_INGR ?? ''}|${dur.TYPE_NAME ?? ''}`
        if (seen.has(dedup)) continue
        seen.add(dedup)

        conflicts.push({
          registeredMedName: med.itemName,
          conflictWith: dur.MIX_INGR ?? '(성분 이름 없음)',
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
      checked: true,
      title: '확인된 충돌은 없어요',
      message:
        '식약처 자료에서는 충돌을 찾지\u00A0못했어요. ' +
        '자료에 없는 제품도 있으니 약사나 의사와 상담해 주세요.',
    }
  }

  const hasDanger = conflicts.some((c) => c.severity === 'danger')
  return {
    level: hasDanger ? 'danger' : 'warn',
    checked: true,
    title: hasDanger ? '함께 드시면 안 돼요' : '함께 드실 때 주의가 필요해요',
    message: hasDanger
      ? '드시기 전에 약사에게 이\u00A0화면을 보여 주세요.'
      : '함께 드셔도 되는지 약사에게 물어보세요.',
    details: conflicts,
  }
}
