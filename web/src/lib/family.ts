/**
 * 가족 연결 클라이언트 (plan.md 42~46)
 *
 * 서버: /api/family (web/functions/api/family/[[path]].ts, D1).
 * - 구성원(부모님): 로그인 없이 초대 코드로 연결하고, 받은 기기 토큰을 이 기기 localStorage에만 둔다.
 * - 관리자·보는 사람(자녀): Google 로그인 → 서버 세션 토큰을 localStorage에 둔다. 관리자 여부는 계정 역할.
 * 앱은 지금처럼 로컬(IndexedDB) 우선이고, 서버에는 등록약 목록 사본만 올린다.
 * 올리기 실패는 사용자에게 알리지 않는다 — 다음에 앱을 열 때 다시 올린다.
 */

import { addMedication, listMedications, type MedicationKind } from './db'

const STORE_KEY = 'pillcheck.family'
const PENDING_JOIN_KEY = 'pillcheck.pendingJoin'
const BASE = '/api/family'
const TIMEOUT_MS = 10_000

export type FamilyRole = 'member' | 'viewer'
export type UserRole = 'admin' | 'user'

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

/** 로그인한 계정 */
export interface AuthUser {
  id: string
  name: string | null
  email: string | null
  role: UserRole
  lastLoginAt?: number | null
}

interface Session {
  token: string
  user: AuthUser
}

interface FamilyStore {
  member?: MemberLink
  session?: Session
}

/** 약 드시는 분(구성원) */
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

/** 함께 보는 가족(계정) */
export interface FamilyViewerView {
  id: string
  displayName: string
  /** 이 그룹 관리자인가 */
  isManager: boolean
  isMe: boolean
  /** 그룹 관리자에게만 보이는 계정 메일 */
  accountEmail: string | null
}

export interface PendingInvite {
  role: FamilyRole
  displayName: string
  memberId: string | null
  expiresAt: number
}

/** 내가 속한 그룹 하나 (plan.md 50: 그룹별 관리자) */
export interface FamilyGroupView {
  id: string
  name: string
  /** 내가 이 그룹의 관리자인가 */
  isManager: boolean
  members: FamilyMemberView[]
  viewers: FamilyViewerView[]
  /** 관리자에게만 채워진다 */
  pendingInvites: PendingInvite[]
}

export interface CreatedInvite {
  code: string
  link: string
  displayName: string
  role: FamilyRole
  expiresAt: number
}

export interface InvitePreview {
  role: FamilyRole
  groupName: string
  displayName: string
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
  // 예전 방식(관리자 키·보는 사람 기기 토큰) 값은 저장하지 않는다
  const clean: FamilyStore = { member: store.member, session: store.session }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(clean))
  } catch {
    /* 저장 공간 부족 등 무시 */
  }
  notifyChanged()
}

function notifyChanged(): void {
  window.dispatchEvent(new Event(FAMILY_CHANGED_EVENT))
}

export function getMemberLink(): MemberLink | null {
  return loadStore().member ?? null
}

function clearMemberLink(): void {
  const store = loadStore()
  delete store.member
  saveStore(store)
}

export function getSessionUser(): AuthUser | null {
  return loadStore().session?.user ?? null
}

function sessionToken(): string | null {
  return loadStore().session?.token ?? null
}

function clearSession(): void {
  const store = loadStore()
  delete store.session
  saveStore(store)
}

/** 가족 탭을 보여 줄 기기인가 (로그인했거나, 로그인해야 이어지는 초대를 들고 있음) */
export function hasFamilyTab(): boolean {
  return Boolean(loadStore().session) || Boolean(getPendingJoin())
}

/** 로그인이 필요한 보는 사람 초대 코드를 잠시 보관한다 (로그인 후 이어서 연결) */
export function savePendingJoin(code: string): void {
  try {
    localStorage.setItem(PENDING_JOIN_KEY, code)
  } catch {
    /* 무시 */
  }
  notifyChanged()
}

export function getPendingJoin(): string | null {
  try {
    return localStorage.getItem(PENDING_JOIN_KEY)
  } catch {
    return null
  }
}

export function clearPendingJoin(): void {
  try {
    localStorage.removeItem(PENDING_JOIN_KEY)
  } catch {
    /* 무시 */
  }
  notifyChanged()
}

// ---------- 요청 ----------

async function request<T>(method: string, path: string, opts: { token?: string | null; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
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

/** 세션이 필요한 요청. 세션이 끝났으면(401) 저장된 세션을 지운다 */
async function sessionRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = sessionToken()
  if (!token) throw new FamilyRequestError(401, 'bad_session')
  try {
    return await request<T>(method, path, { token, body })
  } catch (e) {
    if (e instanceof FamilyRequestError && e.status === 401) clearSession()
    throw e
  }
}

// ---------- 로그인 ----------

let clientIdPromise: Promise<string> | null = null

/** Google OAuth 클라이언트 ID (서버 설정값) */
export function getGoogleClientId(): Promise<string> {
  if (!clientIdPromise) {
    clientIdPromise = request<{ googleClientId: string }>('GET', '/auth/config').then((r) => r.googleClientId)
    clientIdPromise.catch(() => {
      clientIdPromise = null
    })
  }
  return clientIdPromise
}

/** Google이 준 ID 토큰을 서버에서 확인받고 세션을 저장한다 */
export async function signInWithGoogle(credential: string): Promise<AuthUser> {
  const res = await request<{ token: string; user: AuthUser }>('POST', '/auth/google', { body: { credential } })
  const store = loadStore()
  store.session = { token: res.token, user: res.user }
  saveStore(store)
  return res.user
}

/** 서버에서 내 계정(역할 포함)을 다시 받아 저장한다. 세션이 끝났으면 null */
export async function refreshSessionUser(): Promise<AuthUser | null> {
  if (!sessionToken()) return null
  try {
    const res = await sessionRequest<{ user: AuthUser }>('GET', '/auth/me')
    const store = loadStore()
    if (store.session) {
      store.session.user = res.user
      saveStore(store)
    }
    return res.user
  } catch (e) {
    if (e instanceof FamilyRequestError && e.status === 401) return null
    throw e
  }
}

export async function signOut(): Promise<void> {
  const token = sessionToken()
  if (token) {
    try {
      await request('POST', '/auth/logout', { token })
    } catch {
      /* 서버에 못 닿아도 이 기기에서는 로그아웃 */
    }
  }
  clearSession()
}

// ---------- 연결 ----------

/** 초대 코드를 쓰지 않고 어떤 초대인지 본다 */
export async function previewInvite(code: string): Promise<InvitePreview> {
  return request<InvitePreview>('GET', `/invite?code=${encodeURIComponent(code)}`)
}

/**
 * 초대 코드로 연결한다. 보는 사람 초대는 로그인(세션)이 있어야 하며, 없으면
 * FamilyRequestError(code 'login_required')를 던진다 — 코드는 쓰이지 않는다.
 * 구성원이면 기기 토큰을 저장한다. 약 목록은 여기서 올리지 않는다 —
 * 다시 잇기면 서버 백업을 빈 목록으로 덮지 않도록, 부른 쪽이 `settleAfterJoin`으로 마무리한다.
 */
export async function joinFamily(code: string): Promise<JoinResult> {
  const res = await request<{
    token?: string
    role: FamilyRole
    displayName: string
    group: { id: string; name: string }
    meds: FamilyMed[]
  }>('POST', '/join', { token: sessionToken(), body: { code } })

  if (res.role === 'member' && res.token) {
    const store = loadStore()
    store.member = { token: res.token, groupName: res.group.name, displayName: res.displayName }
    saveStore(store)
  } else {
    notifyChanged()
  }
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

// ---------- 그룹 (plan.md 52: 그룹별 관리자) ----------

/** 내가 속한 그룹들. 그룹마다 내가 관리자인지가 들어 있다 */
export async function getFamilyView(): Promise<FamilyGroupView[]> {
  return (await sessionRequest<{ groups: FamilyGroupView[] }>('GET', '/view')).groups
}

/** 그룹 만들기. 만든 사람이 그 그룹의 관리자가 된다 */
export async function createGroup(name: string): Promise<{ id: string; name: string }> {
  return sessionRequest<{ id: string; name: string }>('POST', '/groups', { name })
}

/** 새 초대(역할·이름) 또는 폰을 바꾼 분 다시 잇기(memberId) — 그룹 관리자만 */
export async function createInvite(
  groupId: string,
  input: { role: FamilyRole; displayName: string } | { memberId: string },
): Promise<CreatedInvite> {
  const res = await sessionRequest<{ code: string; role: FamilyRole; displayName: string; expiresAt: number }>(
    'POST',
    `/groups/${encodeURIComponent(groupId)}/invites`,
    input,
  )
  return { ...res, link: `${window.location.origin}/?join=${res.code}` }
}

/** 그룹에서 빼기 — 그룹 관리자만 */
export async function removeFromGroup(groupId: string, memberId: string): Promise<void> {
  await sessionRequest('DELETE', `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`)
}

/** 함께 보는 가족에게 관리 권한 주기/빼기 — 그룹 관리자만 */
export async function setGroupManager(groupId: string, memberId: string, isManager: boolean): Promise<void> {
  await sessionRequest('PUT', `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`, {
    isManager,
  })
}

/** 그룹 나가기 (마지막 관리자는 못 나간다) */
export async function leaveGroup(groupId: string): Promise<void> {
  await sessionRequest('POST', `/groups/${encodeURIComponent(groupId)}/leave`)
}

/** 그룹 지우기 — 그룹 관리자만. 구성원·초대도 함께 지워진다 */
export async function deleteGroup(groupId: string): Promise<void> {
  await sessionRequest('DELETE', `/groups/${encodeURIComponent(groupId)}`)
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
