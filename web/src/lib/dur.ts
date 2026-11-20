import type { InteractionResult, InteractionDetail, UnifiedSearchResult } from './types'
import { db, type RegisteredMedication } from './db'
import { knownIngredients, sharedIngredients } from './ingredient-alias'
import { fetchWithTimeout } from './fetch-timeout'
import {
  EFFICACY_SOURCE,
  findDurConflicts,
  findEfficacyDuplicates,
  isSameProduct,
  medCoverage,
  medKey,
  parseDurPage,
  type DurRow,
  type DurSide,
  type EfcyRow,
  type MedCoverage,
} from './dur-match'

// dev는 Vite 프록시, 배포본은 Cloudflare Pages Function(functions/api/nedrug)이 같은 경로를 받아 키를 붙인다
const DUR_BASE = '/api/nedrug/1471000/DURPrdlstInfoService03'

const DUR_PAGE_SIZE = 500 // 한 약의 행이 200을 넘는다(노비르정 427). 1000은 빈 응답 (2026-11-12 확인)
const DUR_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — DUR 데이터는 자주 안 바뀜

/**
 * 받는 DUR 자료 종류 (같은 서비스 DURPrdlstInfoService03, 품목코드로 거른다)
 * - taboo: 병용금기. 한 행이 "제품 A × 제품 B" 짝
 * - efcy: 효능군중복. 약 하나에 효능군·계열이 붙는다 (plan.md 64)
 */
type DurSet = 'taboo' | 'efcy'
const OPERATION: Record<DurSet, string> = {
  taboo: 'getUsjntTabooInfoList03',
  efcy: 'getEfcyDplctInfoList03',
}

/** in-memory cache: 캐시 키 → 행 */
const memCache = new Map<string, { data: unknown[]; loadedAt: number }>()
/** 받는 중인 자료: 캐시 키 → 진행 중 요청 */
const inflight = new Map<string, Promise<unknown[]>>()

/** 병용금기 v2: 모든 쪽을 받고 매칭 칸만 남긴 형식. 예전 'itemSeq:' 캐시는 1쪽만 받아 잘려 있어 쓰지 않는다 */
function cacheKey(set: DurSet, itemSeq: string): string {
  return set === 'taboo' ? `itemSeq-v2:${itemSeq}` : `${set}-v1:${itemSeq}`
}

async function loadFromIDB(key: string): Promise<unknown[] | null> {
  try {
    const row = await db.durCache.get(key)
    if (!row) return null
    if (Date.now() - row.fetchedAt > DUR_CACHE_TTL_MS) return null
    return row.data as unknown[]
  } catch {
    return null
  }
}

async function saveToIDB(key: string, data: unknown[]): Promise<void> {
  try {
    await db.durCache.put({ id: key, data, fetchedAt: Date.now() })
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

function pickEfcy(r: EfcyRow): EfcyRow {
  return {
    ITEM_SEQ: r.ITEM_SEQ,
    EFFECT_NAME: r.EFFECT_NAME,
    SERS_NAME: r.SERS_NAME,
    INGR_NAME: r.INGR_NAME,
    PROHBT_CONTENT: r.PROHBT_CONTENT,
  }
}

function pickRow(set: DurSet, r: unknown): unknown {
  return set === 'taboo' ? pick(r as DurRow) : pickEfcy(r as EfcyRow)
}

async function fetchDurPage(set: DurSet, itemSeq: string, pageNo: number): Promise<{ items: unknown[]; total: number }> {
  const url =
    `${DUR_BASE}/${OPERATION[set]}` +
    `?type=json` +
    `&itemSeq=${encodeURIComponent(itemSeq)}` +
    `&numOfRows=${DUR_PAGE_SIZE}` +
    `&pageNo=${pageNo}`

  // 시간 초과도 그대로 실패로 둔다: checkInteraction이 그 품목을 "확인 못 함"으로 보여 준다
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`DUR API 응답 오류 (${res.status})`)
  // 결과 코드가 정상이 아니면 던진다: 실패한 품목은 캐시에 남지 않고 "확인 못 함"이 된다 (plan.md 60)
  return parseDurPage<unknown>(await res.json())
}

/** 모든 쪽을 받는다: 첫 쪽의 totalCount로 나머지 쪽을 병렬로 */
async function fetchDurFromApi(set: DurSet, itemSeq: string): Promise<unknown[]> {
  const first = await fetchDurPage(set, itemSeq, 1)
  const rest: Promise<{ items: unknown[] }>[] = []
  for (let n = 2; (n - 1) * DUR_PAGE_SIZE < first.total; n++) rest.push(fetchDurPage(set, itemSeq, n))
  const pages = await Promise.all(rest)
  return [first, ...pages].flatMap((p) => p.items).map((r) => pickRow(set, r))
}

/**
 * 특정 약의 DUR 자료 가져오기 (memory → IDB → API)
 * - 빈 결과도 24h 캐싱 (재호출 절감). 실패는 캐싱하지 않는다
 */
async function fetchDurSet(set: DurSet, itemSeq: string): Promise<unknown[]> {
  if (!itemSeq) return []
  const key = cacheKey(set, itemSeq)

  // 1단계: in-memory
  const mem = memCache.get(key)
  if (mem && Date.now() - mem.loadedAt < DUR_CACHE_TTL_MS) {
    return mem.data
  }

  // 같은 자료를 이미 받는 중이면 그 결과를 같이 기다린다 (가족 탭에서 여러 분이 같은 약을 드실 때, plan.md 56)
  const running = inflight.get(key)
  if (running) return running
  const task = (async () => {
    // 2단계: IndexedDB
    const fromIDB = await loadFromIDB(key)
    if (fromIDB) {
      memCache.set(key, { data: fromIDB, loadedAt: Date.now() })
      return fromIDB
    }

    // 3단계: API
    const fresh = await fetchDurFromApi(set, itemSeq)
    memCache.set(key, { data: fresh, loadedAt: Date.now() })
    void saveToIDB(key, fresh)
    return fresh
  })()
  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

function fetchDurForItemSeq(itemSeq: string): Promise<DurRow[]> {
  return fetchDurSet('taboo', itemSeq) as Promise<DurRow[]>
}

function fetchEfcyForItemSeq(itemSeq: string): Promise<EfcyRow[]> {
  return fetchDurSet('efcy', itemSeq) as Promise<EfcyRow[]>
}

/**
 * 품목코드들의 병용금기와 효능군 자료를 함께 받는다.
 * - receivedTaboo: 병용금기를 받은 품목 (의약품과 영양제 비교에 필요한 것은 이것뿐)
 * - receivedBoth: 둘 다 받은 품목 (의약품끼리 비교에 필요). withEfcy가 아니면 receivedTaboo와 같다
 */
async function fetchDurAll(seqs: string[], withEfcy: boolean) {
  const [taboo, efcy] = await Promise.all([
    Promise.allSettled(seqs.map((seq) => fetchDurForItemSeq(seq))),
    withEfcy ? Promise.allSettled(seqs.map((seq) => fetchEfcyForItemSeq(seq))) : Promise.resolve([]),
  ])
  const receivedTaboo = new Set(seqs.filter((_, i) => taboo[i].status === 'fulfilled'))
  const receivedBoth = withEfcy
    ? new Set(seqs.filter((_, i) => taboo[i].status === 'fulfilled' && efcy[i]?.status === 'fulfilled'))
    : receivedTaboo
  const rows = new Map<string, DurRow>()
  for (const r of taboo) {
    if (r.status === 'fulfilled') for (const row of r.value) rows.set(durDedupKey(row), row)
  }
  const efcyRows: EfcyRow[] = []
  for (const r of efcy) if (r.status === 'fulfilled') efcyRows.push(...r.value)
  return { receivedTaboo, receivedBoth, rows: [...rows.values()], efcyRows }
}

/** 이 둘을 비교할 때 쓰는 "받은 품목" 집합: 의약품끼리는 효능군 자료까지 받아야 대조한 것이다 */
function receivedFor(a: DurSide, b: DurSide, got: { receivedTaboo: Set<string>; receivedBoth: Set<string> }): Set<string> {
  return a.kind === 'drug' && b.kind === 'drug' ? got.receivedBoth : got.receivedTaboo
}

/** DUR row 중복 제거용 키 */
function durDedupKey(d: DurRow): string {
  return d.DUR_SEQ ?? `${d.ITEM_SEQ ?? ''}|${d.MIXTURE_ITEM_SEQ ?? ''}|${d.TYPE_NAME ?? ''}`
}

function toSide(m: RegisteredMedication): DurSide {
  return { kind: m.kind, id: m.itemSeq, name: m.itemName, ingredient: m.mainIngredient }
}

/**
 * 확인 제품과 내 약의 DUR 병용금기 충돌과 효능군중복을 찾는다.
 * - 등록된 의약품 + 확인 제품(의약품이면) 각각의 itemSeq로 DUR 행을 모두 받는다.
 * - 확인 제품이 의약품이면 효능군 자료도 받는다: 같은 효능군·계열인 내 의약품은 노랑 (plan.md 64).
 * - itemSeq별 IDB 캐시 24h — 두 번째부터 즉시.
 * - 매칭은 dur-match.ts: 행의 상대 칸(MIXTURE_*)으로 맞추고, 확인 제품과 같은 내 약은 빼고 비교한다.
 *
 * 한계:
 * - 영양제는 DUR 품목코드가 없어 그쪽 조회는 건너뛴다. 등록된 약의 행에서 상대 성분 이름이
 *   영양제 원료 글에 있는지만 본다.
 * - 병용주의(노랑) 자료는 이 서비스에 없다. 노랑은 효능군중복과 영양제 같은 성분 겹침에서 나온다.
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

  // 2) 병렬로 DUR row fetch (캐시 히트 시 즉시). 효능군은 의약품끼리만 비교하므로 확인 제품이 의약품일 때만
  const seqs = [...itemSeqsToQuery]
  const got = await fetchDurAll(seqs, product.kind === 'drug')

  // 내 약별 대조 상태. 자료를 못 받은 약에 "충돌 못 찾음"을 붙이지 않으려고 따로 센다
  // (0행으로 받은 것도 받은 것이다. 의약품끼리는 효능군 자료까지 받아야 대조한 것이다)
  const coverage: Record<string, MedCoverage> = {}
  for (const med of registered) {
    const side = toSide(med)
    coverage[medKey(side)] = medCoverage(productSide, side, receivedFor(productSide, side, got))
  }
  const states = Object.values(coverage)
  const comparedCount = states.filter((s) => s === 'compared').length
  const uncheckedCount = states.filter((s) => s === 'unchecked').length

  // 영양제끼리 같은 성분 겹침 (식약처 신고 재료 이름 대조). 제품에 별칭표 성분이 없으면 찾지 않는다
  const overlap: Record<string, string[]> = {}
  if (product.kind === 'healthfood' && knownIngredients(product.ingredient).length > 0) {
    for (const med of others) {
      if (med.kind === 'healthfood' && med.mainIngredient?.trim()) {
        overlap[medKey(toSide(med))] = sharedIngredients(product.ingredient, med.mainIngredient)
      }
    }
  }
  const hasOverlap = Object.values(overlap).some((labels) => labels.length > 0)
  const overlapChecked = Object.keys(overlap).length > 0

  // 3) 매칭 (자기 자신은 dur-match.ts에서 뺀다). 병용금기(빨강) 다음에 효능군중복(노랑)
  const sides = registered.map(toSide)
  const conflicts: InteractionDetail[] = [
    ...findDurConflicts(productSide, sides, got.rows),
    ...findEfficacyDuplicates(productSide, sides, got.efcyRows),
  ]

  // 받은 자료에서 충돌이 나오면, 못 받은 약이 있어도 빨강은 그대로다
  if (conflicts.length > 0) {
    const hasDanger = conflicts.some((c) => c.severity === 'danger')
    return {
      level: hasDanger ? 'danger' : 'warn',
      checked: true,
      alreadyRegistered,
      coverage,
      overlap,
      title: hasDanger ? '함께 드시면 안 돼요' : '함께 드실 때 주의가 필요해요',
      message: hasDanger
        ? '드시기 전에 약사에게 이\u00A0화면을 보여 주세요.'
        : conflicts.every((c) => c.source === EFFICACY_SOURCE)
          ? '같은 종류의 약을 겹쳐 드시게 될 수 있어요. 함께\u00A0드셔도 되는지 약사에게 물어보세요.'
          : '함께\u00A0드셔도 되는지 약사에게 물어보세요.',
      details: conflicts,
    }
  }

  // 같은 성분이 겹친다: 식약처 충돌은 아니지만 많이 먹게 될 수 있어 노랑으로 알린다
  if (hasOverlap) {
    return {
      level: 'warn',
      checked: true,
      alreadyRegistered,
      coverage,
      overlap,
      title: '같은 성분이 겹쳐요',
      message: '같은 성분을 여러 제품으로 드시면 너무 많이 드시게 될 수 있어요. 함께\u00A0드셔도 되는지 약사에게 물어보세요.',
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
      overlap,
      title: '일부 내 약은 확인하지\u00A0못했어요',
      message: '식약처 자료를 다 받지 못했어요. 아래에서 확인\u00A0못\u00A0한 약을 보시고 "다시 확인"을 눌러\u00A0주세요.',
    }
  }
  if (comparedCount === 0 && overlapChecked) {
    // 영양제끼리: 병용금기 자료는 없지만 재료 이름으로 같은 성분은 찾아봤다. 괜찮다고 하지 않는다
    return {
      level: 'unknown',
      checked: true,
      alreadyRegistered,
      coverage,
      overlap,
      title: '같은 성분은 못\u00A0찾았어요',
      message: '신고한 재료 이름에서 같은 성분이 겹치는지만 찾아봤어요. 함께 드셔도\u00A0된다는 뜻은\u00A0아니에요.',
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
    overlap,
    // 판정처럼 읽히지 않게 "없어요"가 아니라 "자료에서 못 찾았어요". 약사 안내는 ResultSheet가 상자 안에 붙인다
    title: '식약처 자료에서는 문제를 못\u00A0찾았어요',
    message: '자료에 없는 조합도 있어요. 함께 드셔도\u00A0된다는 뜻은\u00A0아니에요.',
  }
}

/** 한 사람의 약 목록 안에서 찾은 짝: 병용금기(빨강, plan.md 56) 또는 효능군중복(노랑, plan.md 64) */
export interface PairConflict {
  /** medKey (kind:itemSeq) */
  aKey: string
  bKey: string
  aName: string
  bName: string
  severity: 'danger' | 'warn'
  /** 효능군중복이면 효능군 이름 (예: 해열진통소염제) */
  group?: string
}

export interface AmongResult {
  conflicts: PairConflict[]
  /** 자료를 받지 못해 다른 약과 대조하지 못한 약 수 */
  unchecked: number
}

/**
 * 한 사람의 약 목록 안에서 서로 부딪치는 짝을 찾는다 (가족 탭 plan.md 56, 내 약 탭 plan.md 61).
 * `checkInteraction`과 같은 자료(품목코드별 24시간 캐시)와 같은 매칭(`findDurConflicts`, `findEfficacyDuplicates`)을 쓴다.
 * 같은 짝이 병용금기이면서 효능군중복이면 둘 다 넣는다(화면이 빨강과 노랑을 따로 보여 준다).
 * 짝마다 한 번씩만 대조한다 — `findDurConflicts`는 행의 A·B 양쪽 방향을 모두 본다.
 * 영양제끼리는 병용금기 자료가 없어 대조하지 않는다(괜찮다는 뜻이 아님).
 */
export async function findConflictsAmong(
  meds: { kind: RegisteredMedication['kind']; itemSeq: string; itemName: string; mainIngredient?: string }[],
): Promise<AmongResult> {
  const sides: DurSide[] = meds.map((m) => ({ kind: m.kind, id: m.itemSeq, name: m.itemName, ingredient: m.mainIngredient }))
  if (sides.length < 2) return { conflicts: [], unchecked: 0 }

  const seqs = [...new Set(sides.filter((s) => s.kind === 'drug' && s.id).map((s) => s.id))]
  if (seqs.length === 0) return { conflicts: [], unchecked: 0 }
  // 효능군은 의약품이 둘 이상일 때만 의미가 있다
  const got = await fetchDurAll(seqs, seqs.length >= 2)

  const conflicts: PairConflict[] = []
  const uncheckedKeys = new Set<string>()
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      const a = sides[i]
      const b = sides[j]
      if (isSameProduct(a, b)) continue
      const received = receivedFor(a, b, got)
      if (medCoverage(a, b, received) === 'unchecked') {
        for (const s of [a, b]) if (s.kind === 'drug' && !received.has(s.id)) uncheckedKeys.add(medKey(s))
      }
      const pair = { aKey: medKey(a), bKey: medKey(b), aName: a.name, bName: b.name }
      const found = findDurConflicts(a, [b], got.rows)
      if (found.length > 0) {
        conflicts.push({ ...pair, severity: found.some((c) => c.severity === 'danger') ? 'danger' : 'warn' })
      }
      const dup = findEfficacyDuplicates(a, [b], got.efcyRows)
      if (dup.length > 0) {
        conflicts.push({ ...pair, severity: 'warn', group: [...new Set(dup.map((d) => d.conflictWith))].join(', ') })
      }
    }
  }
  return { conflicts, unchecked: uncheckedKeys.size }
}
