/**
 * 가족 연결 클라이언트 (plan.md 42~44)
 *
 * 서버: /api/family (web/functions/api/family/[[path]].ts, D1).
 * 로그인 없이 초대 코드로 연결하고, 받은 토큰은 이 기기 localStorage에만 둔다.
 * 앱은 지금처럼 로컬(IndexedDB) 우선이고, 서버에는 등록약 목록 사본만 올린다.
 * 올리기 실패는 사용자에게 알리지 않는다 — 다음에 앱을 열 때 다시 올린다.
 */

import { addMedication, listMedications, type MedicationKind } from './db'

const STORE_KEY = 'pillcheck.family'
const BASE = '/api/family'
const TIMEOUT_MS = 10_000

export type FamilyRole = 'member' | 'viewer'

export interface FamilyMed {
  kind: MedicationKind
  itemSeq: string
  itemName: string
  manufacturer?: string
  mainIngredient?: string
  registeredAt: number
}

/** 이 기기가 구성원(약을 올리는 사람)으로 연결된 정보 */
export interface MemberLink {
  token: string
  groupName: string
  displayName: string
}

/** 이 기기가 보는 사람으로 연결된 그룹 하나 */
export interface ViewerLink {
  token: string
  groupId: string
  groupName: string
  displayName: string
}

interface FamilyStore {
  member?: MemberLink
  viewers?: ViewerLink[]
  /** 관리자 기기만. 그룹·초대를 만들고 모든 그룹을 본다 */
  adminKey?: string
}

/** 보는 사람·관리자에게 보이는 구성원 */
export interface FamilyMemberView {
  id: string
  role: FamilyRole
  displayName: string
  /** 다시 잇기 초대만 있고 아직 기기가 없으면 false */
  connected: boolean
  lastSeenAt: number | null
  medsUpdatedAt: number | null
  meds: FamilyMed[]
}

export interface FamilyGroupView {
  id: string
  name: string
  /** 약을 등록하는 구성원 */
  members: FamilyMemberView[]
  /** 보는 사람 (관리자 화면에서만 id가 필요해 구성원 모양 그대로) */
  viewers: FamilyMemberView[]
  /** 그룹을 못 불러왔을 때의 오류. 화면에서 friendlyError로 바꿔 보여 준다 */
  error?: unknown
}

export interface CreatedInvite {
  code: string
  link: string
  displayName: string
  role: FamilyRole
  expiresAt: number
}

/** 가족 연결 정보가 바뀌면 window에 보내는 이벤트 (App이 가족 탭 표시를 다시 정함) */
export const FAMILY_CHANGED_EVENT = 'pillcheck:family-changed'

export interface JoinResult {
  role: FamilyRole
  displayName: string
  groupName: string
  /** 다시 잇기일 때 서버에 남아 있던 약(구성원만). 새 연결이면 빈 배열 */
  meds: FamilyMed[]
}

export interface MyFamily {
  groupName: string
  viewers: string[]
}

export class FamilyRequestError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(`가족 연결 요청 실패 (${status} ${code})`)
    this.name = 'FamilyRequestError'
    this.status = status
    this.code = code
  }
}

// ---------- 저장 ----------

function loadStore(): FamilyStore {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as FamilyStore) : {}
  } catch {
    return {}
  }
}

function saveStore(store: FamilyStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* 저장 공간 부족 등 무시 */
  }
  window.dispatchEvent(new Event(FAMILY_CHANGED_EVENT))
}

/** 가족 탭을 보여 줄 기기인가 (보는 사람으로 연결됐거나 관리자 키가 있음) */
export function hasFamilyTab(): boolean {
  const store = loadStore()
  return Boolean(store.adminKey) || (store.viewers?.length ?? 0) > 0
}

export function getAdminKey(): string | null {
  return loadStore().adminKey ?? null
}

export function clearAdminKey(): void {
  const store = loadStore()
  delete store.adminKey
  saveStore(store)
}

function removeViewerLink(groupId: string): void {
  const store = loadStore()
  store.viewers = (store.viewers ?? []).filter((v) => v.groupId !== groupId)
  saveStore(store)
}

export function getMemberLink(): MemberLink | null {
  return loadStore().member ?? null
}

export function getViewerLinks(): ViewerLink[] {
  return loadStore().viewers ?? []
}

function clearMemberLink(): void {
  const store = loadStore()
  delete store.member
  saveStore(store)
}

// ---------- 요청 ----------

async function request<T>(
  method: string,
  path: string,
  opts: { token?: string; adminKey?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts.adminKey) headers['X-Admin-Key'] = opts.adminKey
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* 본문이 JSON이 아님 (dev에서 함수 서버가 없을 때 등) */
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? 'unknown'
    throw new FamilyRequestError(res.status, code)
  }
  if (data === null) throw new FamilyRequestError(res.status, 'bad_response')
  return data as T
}

// ---------- 연결 ----------

/**
 * 초대 코드로 연결하고 토큰을 저장한다. 약 목록은 여기서 올리지 않는다 —
 * 다시 잇기면 서버 백업을 빈 목록으로 덮지 않도록, 부른 쪽이 `settleAfterJoin`으로 마무리한다.
 */
export async function joinFamily(code: string): Promise<JoinResult> {
  const res = await request<{
    token: string
    role: FamilyRole
    displayName: string
    group: { id: string; name: string }
    meds: FamilyMed[]
  }>('POST', '/join', { body: { code } })

  const store = loadStore()
  if (res.role === 'member') {
    store.member = { token: res.token, groupName: res.group.name, displayName: res.displayName }
  } else {
    const others = (store.viewers ?? []).filter((v) => v.groupId !== res.group.id)
    store.viewers = [
      ...others,
      { token: res.token, groupId: res.group.id, groupName: res.group.name, displayName: res.displayName },
    ]
  }
  saveStore(store)
  return { role: res.role, displayName: res.displayName, groupName: res.group.name, meds: res.meds ?? [] }
}

/**
 * 연결 직후 마무리 (구성원만).
 * 서버에 약이 남아 있고(폰을 바꿔 다시 이음) 이 기기에 약이 없으면 `ask`로 불러올지 묻고 넣는다.
 * 그다음 이 기기 목록을 올린다 — 기기에 약이 있으면 묻지 않고 기기 목록이 기준이 된다.
 * 돌려주는 값은 불러온 약 개수.
 */
export async function settleAfterJoin(res: JoinResult, ask: (count: number) => Promise<boolean>): Promise<number> {
  if (res.role !== 'member') return 0
  let restored = 0
  if (res.meds.length > 0 && (await listMedications()).length === 0 && (await ask(res.meds.length))) {
    for (const med of res.meds) {
      try {
        await addMedication({
          kind: med.kind,
          itemSeq: med.itemSeq,
          itemName: med.itemName,
          manufacturer: med.manufacturer,
          mainIngredient: med.mainIngredient,
        })
        restored++
      } catch {
        // 중복·10개 한도는 건너뛴다
      }
    }
  }
  scheduleFamilySync(0)
  return restored
}

/** 내 그룹 이름과 볼 수 있는 사람. 구성원으로 연결돼 있지 않으면 null */
export async function getMyFamily(): Promise<MyFamily | null> {
  const member = getMemberLink()
  if (!member) return null
  try {
    const res = await request<{ group: { name: string } | null; viewers: string[] }>('GET', '/me', {
      token: member.token,
    })
    return { groupName: res.group?.name ?? member.groupName, viewers: res.viewers }
  } catch (e) {
    // 관리자가 빼거나 다른 기기로 다시 이어 이 토큰이 무효가 된 경우
    if (e instanceof FamilyRequestError && e.status === 401) clearMemberLink()
    throw e
  }
}

/** 연결 끊기 = 서버의 내 정보(약 목록 포함) 지우기. 기기의 약은 그대로 둔다 */
export async function leaveFamily(): Promise<void> {
  const member = getMemberLink()
  if (!member) return
  try {
    await request('DELETE', '/me', { token: member.token })
  } catch (e) {
    // 이미 서버에 없으면 끊긴 것과 같다
    if (!(e instanceof FamilyRequestError && e.status === 401)) throw e
  }
  clearMemberLink()
}

// ---------- 보기 (보는 사람·관리자) ----------

/**
 * 가족 탭에 보여 줄 그룹들.
 * 관리자 키가 있으면 모든 그룹, 없으면 이 기기가 보는 사람으로 연결된 그룹만.
 */
export async function getFamilyView(): Promise<FamilyGroupView[]> {
  const adminKey = getAdminKey()
  if (adminKey) {
    const res = await request<{ groups: { id: string; name: string; members: FamilyMemberView[] }[] }>(
      'GET',
      '/admin/groups',
      { adminKey },
    )
    return res.groups.map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.filter((m) => m.role === 'member'),
      viewers: g.members.filter((m) => m.role === 'viewer'),
    }))
  }

  const links = getViewerLinks()
  return Promise.all(
    links.map(async (link): Promise<FamilyGroupView> => {
      try {
        const res = await request<{ group: { id: string; name: string }; members: FamilyMemberView[]; viewers: string[] }>(
          'GET',
          '/view',
          { token: link.token },
        )
        return {
          id: res.group.id,
          name: res.group.name,
          members: res.members,
          viewers: res.viewers.map((name, i) => ({
            id: `viewer-${i}`,
            role: 'viewer' as const,
            displayName: name,
            connected: true,
            lastSeenAt: null,
            medsUpdatedAt: null,
            meds: [],
          })),
        }
      } catch (e) {
        // 관리자가 이 기기를 뺐거나 그룹이 지워졌으면 연결 정보를 지운다
        if (e instanceof FamilyRequestError && e.status === 401) removeViewerLink(link.groupId)
        return { id: link.groupId, name: link.groupName, members: [], viewers: [], error: e }
      }
    }),
  )
}

// ---------- 관리자 ----------

function requireAdminKey(): string {
  const key = getAdminKey()
  if (!key) throw new FamilyRequestError(401, 'bad_admin_key')
  return key
}

/** 키가 맞는지 서버에 물어본 뒤 저장한다 */
export async function saveAdminKey(key: string): Promise<void> {
  const trimmed = key.trim()
  await request('GET', '/admin/groups', { adminKey: trimmed })
  const store = loadStore()
  store.adminKey = trimmed
  saveStore(store)
}

export async function adminCreateGroup(name: string): Promise<void> {
  await request('POST', '/admin/groups', { adminKey: requireAdminKey(), body: { name } })
}

/** 새 초대(역할·이름) 또는 다시 잇기 초대(memberId) */
export async function adminCreateInvite(input: {
  groupId: string
  role?: FamilyRole
  displayName?: string
  memberId?: string
}): Promise<CreatedInvite> {
  const res = await request<{ code: string; role: FamilyRole; displayName: string; expiresAt: number }>(
    'POST',
    '/admin/invites',
    { adminKey: requireAdminKey(), body: input },
  )
  return { ...res, link: `${window.location.origin}/?join=${res.code}` }
}

export async function adminRemoveMember(memberId: string): Promise<void> {
  await request('DELETE', `/admin/members/${encodeURIComponent(memberId)}`, { adminKey: requireAdminKey() })
}

// ---------- 약 목록 올리기 ----------

let syncTimer: ReturnType<typeof setTimeout> | undefined
let syncing = false
let syncAgain = false

/** 등록약이 바뀌었을 때 부른다. 짧게 모았다가 한 번만 올린다 */
export function scheduleFamilySync(delayMs = 1500): void {
  if (!getMemberLink()) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void runSync(), delayMs)
}

async function runSync(): Promise<void> {
  if (syncing) {
    syncAgain = true
    return
  }
  const member = getMemberLink()
  if (!member) return
  syncing = true
  try {
    const list = await listMedications()
    const meds: FamilyMed[] = list.map((m) => ({
      kind: m.kind,
      itemSeq: m.itemSeq,
      itemName: m.itemName,
      manufacturer: m.manufacturer,
      mainIngredient: m.mainIngredient,
      registeredAt: m.registeredAt,
    }))
    await request('PUT', '/me/meds', { token: member.token, body: { meds } })
  } catch (e) {
    if (e instanceof FamilyRequestError && e.status === 401) clearMemberLink()
    // 그 밖의 실패(인터넷 끊김 등)는 조용히 넘긴다. 다음에 앱을 열 때 다시 올린다
  } finally {
    syncing = false
    if (syncAgain) {
      syncAgain = false
      scheduleFamilySync(0)
    }
  }
}
