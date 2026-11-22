/**
 * DUR 병용금기 행과 "내 약 + 확인 제품"을 맞춰 충돌을 찾는 순수 함수.
 * import 없이 둔다: scripts/gate-search/check-dur.mjs가 Node로 바로 읽는다.
 *
 * 식약처 getUsjntTabooInfoList03 응답 구조 (2026-11-12 실제 응답으로 확인):
 * - 한 행은 "제품 A × 제품 B" 한 쌍이다. A는 ITEM_SEQ, INGR_KOR_NAME, MAIN_INGR 칸.
 * - 상대 B는 MIXTURE_ITEM_SEQ, MIXTURE_INGR_KOR_NAME, MIXTURE_MAIN_INGR("[M089710]심바스타틴") 칸.
 * - MIX_INGR는 대부분 비어 있고, 복합제일 때 A 자기 쪽 성분이다. 상대로 쓰면 안 된다.
 */

export interface DurRow {
  DUR_SEQ?: string
  TYPE_NAME?: string
  ITEM_SEQ?: string
  ITEM_NAME?: string
  INGR_KOR_NAME?: string
  MAIN_INGR?: string
  MIXTURE_ITEM_SEQ?: string
  MIXTURE_ITEM_NAME?: string
  MIXTURE_INGR_KOR_NAME?: string
  MIXTURE_MAIN_INGR?: string
  PROHBT_CONTENT?: string
}

/**
 * DUR 서비스 응답 한 쪽을 읽는다. 결과 코드가 정상이 아니면 던진다 (plan.md 60).
 * 식약처는 오류도 HTTP 200 + `{"header":{"resultCode":"11",...},"body":{}}`로 보낸다(2026-11-21 확인).
 * 이것을 0행으로 받으면 "금기 없음"으로 24시간 저장된다. 정상 0건은 resultCode "00" + totalCount 0이고 items 칸이 없다.
 */
export function parseDurPage<T>(json: unknown): { items: T[]; total: number } {
  const data = json as { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: T | T[]; totalCount?: unknown } }
  const code = data?.header?.resultCode
  if (code !== '00') throw new Error(`DUR 응답 결과 코드 ${code ?? '없음'} ${data?.header?.resultMsg ?? ''}`.trim())
  const total = Number(data.body?.totalCount)
  if (data.body?.totalCount == null || !Number.isFinite(total)) throw new Error('DUR 응답에 전체 건수가 없음')
  const items = data.body?.items ?? []
  return { items: Array.isArray(items) ? items : [items], total }
}

/** 비교할 한쪽: 내 약 또는 확인 제품 */
export interface DurSide {
  kind: 'drug' | 'healthfood'
  /** drug: 품목기준코드(ITEM_SEQ), healthfood: 신고번호 */
  id: string
  name: string
  /** drug: MAIN_ITEM_INGR("[M코드]한글"), healthfood: 원료 이름 글 */
  ingredient?: string
}

export interface DurConflict {
  registeredMedName: string
  /** 확인 제품 쪽에서 문제가 되는 성분 이름 */
  conflictWith: string
  severity: 'danger' | 'warn'
  source: string
  prohbtContent?: string
}

/** 같은 제품인가 (이미 등록한 제품을 다시 확인할 때 자기 자신과 비교하지 않는다) */
export function isSameProduct(a: DurSide, b: DurSide): boolean {
  return a.kind === b.kind && a.id !== '' && a.id === b.id
}

/**
 * 내 약 하나를 확인 제품과 비교할 자료가 있었는가.
 * - compared: 필요한 자료를 모두 받아 대조했다
 * - unchecked: 필요한 자료를 받지 못했다 ("충돌 못 찾음"이라고 말하면 안 된다)
 * - na: 영양제끼리라 병용금기 자료로 비교할 수 없다
 * - self: 확인 제품 자신
 */
export type MedCoverage = 'compared' | 'unchecked' | 'na' | 'self'

/** 결과에서 내 약을 가리키는 키 (이름은 겹칠 수 있다) */
export function medKey(side: { kind: string; id: string }): string {
  return `${side.kind}:${side.id}`
}

/**
 * received: 병용금기 행을 실제로 받은 의약품 품목코드(0행으로 받은 것도 포함).
 * 의약품끼리는 양쪽 자료가 모두 있어야 대조한 것으로 본다. 한쪽 자료만으로 충분한지는
 * 확인하지 못해서 보수적으로 잡았다 (2026-11-13).
 */
export function medCoverage(product: DurSide, med: DurSide, received: ReadonlySet<string>): MedCoverage {
  if (isSameProduct(med, product)) return 'self'
  const needs: string[] = []
  if (med.kind === 'drug') needs.push(med.id)
  if (product.kind === 'drug') needs.push(product.id)
  if (needs.length === 0) return 'na'
  return needs.every((id) => id !== '' && received.has(id)) ? 'compared' : 'unchecked'
}

function ingrCodes(s: string | undefined): Set<string> {
  return new Set((s ?? '').match(/M\d{6}/g) ?? [])
}

/** "심바스타틴(...)" → "심바스타틴" */
function plainName(s: string | undefined): string {
  return (s ?? '').replace(/\([^)]*\)/g, '').trim()
}

/** 행의 A 쪽이 이 제품인가: 의약품 품목코드로만 (영양제는 DUR의 A가 될 수 없다) */
function isPrimary(row: DurRow, side: DurSide): boolean {
  return side.kind === 'drug' && !!row.ITEM_SEQ && row.ITEM_SEQ === side.id
}

/** 행의 상대(B) 쪽이 이 제품인가 */
function isCounterpart(row: DurRow, side: DurSide): boolean {
  if (side.kind === 'drug') {
    if (row.MIXTURE_ITEM_SEQ && row.MIXTURE_ITEM_SEQ === side.id) return true
    // 보조: 같은 주성분 코드(품목이 새로 생겨 목록에 없을 때)
    const mine = ingrCodes(side.ingredient)
    for (const c of ingrCodes(row.MIXTURE_MAIN_INGR)) if (mine.has(c)) return true
    return false
  }
  // 영양제: 상대 성분 이름이 원료 이름 글에 그대로 있는가
  const name = plainName(row.MIXTURE_INGR_KOR_NAME).toLowerCase()
  return name.length >= 2 && (side.ingredient ?? '').toLowerCase().includes(name)
}

/**
 * 확인 제품과 내 약 사이의 DUR 충돌을 찾는다.
 * - 확인 제품과 같은 내 약은 건너뛴다.
 * - 행의 A가 내 약이고 상대가 확인 제품이거나, 그 반대이면 충돌이다.
 * - 이름은 확인 제품 쪽 성분: 앞 경우는 MIXTURE_INGR_KOR_NAME, 뒤 경우는 INGR_KOR_NAME.
 *   비어 있으면 확인 제품 이름을 쓴다.
 */
export function findDurConflicts(product: DurSide, registered: DurSide[], rows: DurRow[]): DurConflict[] {
  const out: DurConflict[] = []
  const seen = new Set<string>()

  for (const med of registered) {
    if (isSameProduct(med, product)) continue

    for (const row of rows) {
      let ingr: string | undefined
      if (isPrimary(row, med) && isCounterpart(row, product)) ingr = row.MIXTURE_INGR_KOR_NAME
      else if (isPrimary(row, product) && isCounterpart(row, med)) ingr = row.INGR_KOR_NAME
      else continue

      const conflictWith = plainName(ingr) || product.name
      const type = row.TYPE_NAME ?? '병용금기'
      const key = `${med.kind}|${med.id}|${conflictWith}|${type}`
      if (seen.has(key)) continue
      seen.add(key)

      out.push({
        registeredMedName: med.name,
        conflictWith,
        severity: type.includes('금기') ? 'danger' : 'warn',
        source: type,
        prohbtContent: row.PROHBT_CONTENT || undefined,
      })
    }
  }
  return out
}

/**
 * 효능군중복 행 (getEfcyDplctInfoList03, 2026-11-21 실제 응답으로 확인).
 * 짝이 아니라 약 하나에 효능군(EFFECT_NAME)과 계열(SERS_NAME)이 붙는다. 복합제는 같은 계열 행이 여럿일 수 있다.
 */
export interface EfcyRow {
  ITEM_SEQ?: string
  EFFECT_NAME?: string
  SERS_NAME?: string
  INGR_NAME?: string
  PROHBT_CONTENT?: string | null
}

export const EFFICACY_SOURCE = '효능군중복'

/** 그 약이 속한 묶음: "효능군|계열" → 그 행 (plan.md 64 결정: 효능군과 계열이 둘 다 같아야 중복) */
function efficacyGroups(side: DurSide, rows: EfcyRow[]): Map<string, EfcyRow> {
  const out = new Map<string, EfcyRow>()
  if (side.kind !== 'drug' || !side.id) return out
  for (const r of rows) {
    if (r.ITEM_SEQ !== side.id || !r.EFFECT_NAME) continue
    const key = `${r.EFFECT_NAME}|${r.SERS_NAME ?? ''}`
    if (!out.has(key)) out.set(key, r)
  }
  return out
}

/**
 * 확인 제품과 같은 효능군·같은 계열인 내 의약품을 찾는다 (노랑 주의).
 * - 의약품끼리만 본다. 확인 제품과 같은 품목은 건너뛴다.
 * - conflictWith는 효능군 이름(예: 해열진통소염제). 묶음마다 한 번만.
 */
export function findEfficacyDuplicates(product: DurSide, registered: DurSide[], rows: EfcyRow[]): DurConflict[] {
  const mine = efficacyGroups(product, rows)
  if (mine.size === 0) return []
  const out: DurConflict[] = []
  for (const med of registered) {
    if (isSameProduct(med, product)) continue
    for (const [key, row] of efficacyGroups(med, rows)) {
      if (!mine.has(key)) continue
      out.push({
        registeredMedName: med.name,
        conflictWith: row.EFFECT_NAME ?? '',
        severity: 'warn',
        source: EFFICACY_SOURCE,
        prohbtContent: mine.get(key)?.PROHBT_CONTENT || row.PROHBT_CONTENT || undefined,
      })
    }
  }
  return out
}
