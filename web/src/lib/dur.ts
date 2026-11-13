import type { InteractionResult, InteractionDetail, UnifiedSearchResult } from './types'
import { db, type RegisteredMedication } from './db'
import {
  findDurConflicts,
  isSameProduct,
  medCoverage,
  medKey,
  type DurRow,
  type DurSide,
  type MedCoverage,
} from './dur-match'

const NEDRUG_KEY = import.meta.env.VITE_NEDRUG_API_KEY ?? ''
const isDev = import.meta.env.DEV
const DUR_BASE = isDev
  ? '/api/nedrug/1471000/DURPrdlstInfoService03'
  : 'https://apis.data.go.kr/1471000/DURPrdlstInfoService03'

interface DurResponseBody {
  body?: {
    items?: DurRow | DurRow[]
    totalCount?: number
  }
}

const DUR_PAGE_SIZE = 500 // 한 약의 행이 200을 넘는다(노비르정 427). 1000은 빈 응답 (2026-11-12 확인)
const DUR_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — DUR 데이터는 자주 안 바뀜

/** in-memory cache: itemSeq → DurRow[] */
const memCache = new Map<string, { data: DurRow[]; loadedAt: number }>()

/** v2: 모든 쪽을 받고 매칭 칸만 남긴 형식. 예전 'itemSeq:' 캐시는 1쪽만 받아 잘려 있어 쓰지 않는다 */
function cacheKey(itemSeq: string): string {
  return `itemSeq-v2:${itemSeq}`
}

async function loadFromIDB(itemSeq: string): Promise<DurRow[] | null> {
  try {
    const row = await db.durCache.get(cacheKey(itemSeq))
    if (!row) return null
    if (Date.now() - row.fetchedAt > DUR_CACHE_TTL_MS) return null
    return row.data as DurRow[]
  } catch {
    return null
  }
}

async function saveToIDB(itemSeq: string, data: DurRow[]): Promise<void> {
  try {
    await db.durCache.put({ id: cacheKey(itemSeq), data, fetchedAt: Date.now() })
  } catch {
    /* IDB 실패는 치명적 아님 */
  }
}

/** 매칭과 화면에 쓰는 칸만 남긴다 (캐시 크기 줄이기) */
function pick(r: DurRow): DurRow {
  return {
    DUR_SEQ: r.DUR_SEQ,
    TYPE_NAME: r.TYPE_NAME,
    ITEM_SEQ: r.ITEM_SEQ,
    INGR_KOR_NAME: r.INGR_KOR_NAME,
    MIXTURE_ITEM_SEQ: r.MIXTURE_ITEM_SEQ,
    MIXTURE_INGR_KOR_NAME: r.MIXTURE_INGR_KOR_NAME,
    MIXTURE_MAIN_INGR: r.MIXTURE_MAIN_INGR,
    PROHBT_CONTENT: r.PROHBT_CONTENT,
  }
}

async function fetchDurPage(itemSeq: string, pageNo: number): Promise<{ items: DurRow[]; total: number }> {
  const url =
    `${DUR_BASE}/getUsjntTabooInfoList03` +
    `?serviceKey=${NEDRUG_KEY}` +
    `&type=json` +
    `&itemSeq=${encodeURIComponent(itemSeq)}` +
    `&numOfRows=${DUR_PAGE_SIZE}` +
    `&pageNo=${pageNo}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`DUR API 응답 오류 (${res.status})`)
  const data = (await res.json()) as DurResponseBody
  const items = data.body?.items ?? []
  return { items: Array.isArray(items) ? items : [items], total: Number(data.body?.totalCount ?? 0) }
}

/** 모든 쪽을 받는다: 첫 쪽의 totalCount로 나머지 쪽을 병렬로 */
async function fetchDurFromApi(itemSeq: string): Promise<DurRow[]> {
  if (!NEDRUG_KEY) throw new Error('식약처 API 키가 없습니다.')

  const first = await fetchDurPage(itemSeq, 1)
  const rest: Promise<{ items: DurRow[] }>[] = []
  for (let n = 2; (n - 1) * DUR_PAGE_SIZE < first.total; n++) rest.push(fetchDurPage(itemSeq, n))
  const pages = await Promise.all(rest)
  return [first, ...pages].flatMap((p) => p.items).map(pick)
}

/**
 * 특정 약의 DUR row 가져오기 (memory → IDB → API)
 * - 빈 결과도 24h 캐싱 (재호출 절감)
 */
async function fetchDurForItemSeq(itemSeq: string): Promise<DurRow[]> {
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

/** DUR row 중복 제거용 키 */
function durDedupKey(d: DurRow): string {
  return d.DUR_SEQ ?? `${d.ITEM_SEQ ?? ''}|${d.MIXTURE_ITEM_SEQ ?? ''}|${d.TYPE_NAME ?? ''}`
}

function toSide(m: RegisteredMedication): DurSide {
  return { kind: m.kind, id: m.itemSeq, name: m.itemName, ingredient: m.mainIngredient }
}

/**
 * 확인 제품과 내 약의 DUR 병용금기 충돌을 찾는다.
 * - 등록된 의약품 + 확인 제품(의약품이면) 각각의 itemSeq로 DUR 행을 모두 받는다.
 * - itemSeq별 IDB 캐시 24h — 두 번째부터 즉시.
 * - 매칭은 dur-match.ts: 행의 상대 칸(MIXTURE_*)으로 맞추고, 확인 제품과 같은 내 약은 빼고 비교한다.
 *
 * 한계:
 * - 영양제는 DUR 품목코드가 없어 그쪽 조회는 건너뛴다. 등록된 약의 행에서 상대 성분 이름이
 *   영양제 원료 글에 있는지만 본다.
 * - 이 API는 병용금기만 준다(노랑 병용주의 자료는 연결 안 됨).
 * - 매칭 미발견 → 회색, 초록으로 단정 안 함.
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

  const productSide: DurSide = {
    kind: product.kind,
    id: product.id,
    name: product.name,
    ingredient: product.ingredient,
  }
  const alreadyRegistered = registered.some((m) => isSameProduct(toSide(m), productSide))
  const others = registered.filter((m) => !isSameProduct(toSide(m), productSide))
  if (others.length === 0) {
    return {
      level: 'unknown',
      alreadyRegistered,
      title: '비교할 다른 내 약이 없어요',
      message: '이 제품은 이미 내 약에 있어요. 드시는 다른 약을 등록하면 함께 드셔도 되는지 확인할 수\u00A0있어요.',
    }
  }

  // 1) 검사 대상 itemSeq 모으기: 등록된 drug + 새 제품(drug인 경우)
  const itemSeqsToQuery = new Set<string>()
  for (const med of registered) {
    if (med.kind === 'drug' && med.itemSeq) itemSeqsToQuery.add(med.itemSeq)
  }
  if (product.kind === 'drug' && product.id) itemSeqsToQuery.add(product.id)

  // 2) 병렬로 DUR row fetch (캐시 히트 시 즉시)
  const seqs = [...itemSeqsToQuery]
  const fetchResults = await Promise.allSettled(seqs.map((seq) => fetchDurForItemSeq(seq)))

  // 자료를 실제로 받은 품목코드 (0행으로 받은 것도 받은 것이다)
  const received = new Set(seqs.filter((_, i) => fetchResults[i].status === 'fulfilled'))

  // 내 약별 대조 상태. 자료를 못 받은 약에 "충돌 못 찾음"을 붙이지 않으려고 따로 센다
  const coverage: Record<string, MedCoverage> = {}
  for (const med of registered) {
    const side = toSide(med)
    coverage[medKey(side)] = medCoverage(productSide, side, received)
  }
  const states = Object.values(coverage)
  const comparedCount = states.filter((s) => s === 'compared').length
  const uncheckedCount = states.filter((s) => s === 'unchecked').length

  // 3) 모든 결과 dedup 합산
  const allRows = new Map<string, DurRow>()
  for (const r of fetchResults) {
    if (r.status === 'fulfilled') {
      for (const row of r.value) allRows.set(durDedupKey(row), row)
    }
  }

  // 4) 매칭 (자기 자신은 dur-match.ts에서 뺀다)
  const conflicts: InteractionDetail[] = findDurConflicts(productSide, registered.map(toSide), [...allRows.values()])

  // 받은 자료에서 충돌이 나오면, 못 받은 약이 있어도 빨강은 그대로다
  if (conflicts.length > 0) {
    const hasDanger = conflicts.some((c) => c.severity === 'danger')
    return {
      level: hasDanger ? 'danger' : 'warn',
      checked: true,
      alreadyRegistered,
      coverage,
      title: hasDanger ? '함께 드시면 안 돼요' : '함께 드실 때 주의가 필요해요',
      message: hasDanger
        ? '드시기 전에 약사에게 이\u00A0화면을 보여 주세요.'
        : '함께\u00A0드셔도 되는지 약사에게 물어보세요.',
      details: conflicts,
    }
  }

  // 충돌은 못 찾았다. 실제로 얼마나 대조했는지에 따라 말이 달라진다
  if (uncheckedCount > 0 && comparedCount === 0) {
    // 대조한 약이 하나도 없다 (네트워크, 키 문제)
    return {
      level: 'unknown',
      alreadyRegistered,
      coverage,
      title: '지금은 확인할 수 없어요',
      message:
        '식약처 자료를 받아 오지 못했어요. 인터넷 연결을 확인한 뒤 "다시 확인"을 눌러 보시고, 급하면 약사에게 직접 물어보세요.',
    }
  }
  if (uncheckedCount > 0) {
    // 일부만 대조했다. 못 받은 약을 "충돌 못 찾음"이라고 하지 않는다
    return {
      level: 'unknown',
      checked: true,
      alreadyRegistered,
      coverage,
      title: '일부 내 약은 확인하지\u00A0못했어요',
      message: '식약처 자료를 다 받지 못했어요. 아래에서 확인\u00A0못\u00A0한 약을 보시고 "다시 확인"을 눌러\u00A0주세요.',
    }
  }
  if (comparedCount === 0) {
    // 영양제끼리: 조회할 병용금기 자료가 없다. "비교했어요"라고 하지 않는다
    return {
      level: 'unknown',
      alreadyRegistered,
      coverage,
      title: '식약처 자료로는 비교할 수\u00A0없어요',
      message:
        '식약처 병용금기 자료는 의약품 기준이에요. 영양제끼리는 이 자료로 비교할 수 없으니, 함께\u00A0드셔도 되는지 약사에게 물어보세요.',
    }
  }

  return {
    level: 'unknown',
    checked: true,
    alreadyRegistered,
    coverage,
    // 판정처럼 읽히지 않게 "없어요"가 아니라 "자료에서 못 찾았어요". 약사 안내는 ResultSheet가 상자 안에 붙인다
    title: '식약처 자료에서는 충돌을 못\u00A0찾았어요',
    message: '자료에 없는 조합도 있어요. 함께 드셔도\u00A0된다는 뜻은\u00A0아니에요.',
  }
}
