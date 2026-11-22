/**
 * Cloudflare Pages Function — 가족 연결 (plan.md 41, 45, 50)
 *
 * 구성원(부모님)은 로그인 없이 초대 코드로 기기를 잇고 기기 토큰을 받는다.
 * 보는 사람(자녀)은 Google 로그인 계정으로 들어온다. 로그인한 누구나 그룹을 만들 수 있고,
 * 만든 사람(과 그가 권한을 준 보는 사람)이 그 그룹의 관리자다(family_members.is_manager).
 * 서비스 운영자 계정(auth_users.role = 'admin')이라도 자기가 속하지 않은 그룹은 볼 수 없다.
 * 서버(D1 FAMILY_DB)에는 기기 토큰·세션 토큰·초대 코드의 SHA-256 해시만 둔다.
 *
 *   GET    /api/family/auth/config        → { googleClientId }
 *   POST   /api/family/auth/google        { credential } Google ID 토큰 검증 → { token, user }
 *   GET    /api/family/auth/me            (세션) → { user }
 *   POST   /api/family/auth/logout        (세션)
 *   GET    /api/family/invite?code=       초대 미리보기(코드를 쓰지 않음) → { role, groupName, displayName }
 *   POST   /api/family/join               { code } (보는 사람 초대는 세션 필요)
 *   GET    /api/family/me                 (기기 토큰) 내 그룹과 볼 수 있는 사람
 *   PUT    /api/family/me/meds            (기기 토큰) { meds } 등록약 목록 통째로 올리기
 *   DELETE /api/family/me                 (기기 토큰) 연결 끊기 = 서버의 내 정보 지우기
 *   GET    /api/family/view                       (세션) 내가 속한 그룹들(그룹마다 내가 관리자인지)
 *   POST   /api/family/groups                     (세션) { name } 그룹 만들기 → 만든 사람이 관리자
 *   DELETE /api/family/groups/:id                 (그룹 관리자) 그룹 지우기
 *   POST   /api/family/groups/:id/invites         (그룹 관리자) { role, displayName } 또는 { memberId } 다시 잇기
 *   DELETE /api/family/groups/:id/members/:mid    (그룹 관리자) 빼기
 *   PUT    /api/family/groups/:id/members/:mid    (그룹 관리자) { isManager } 관리 권한 주기/빼기
 *   POST   /api/family/groups/:id/leave           (그룹의 보는 사람) 그룹 나가기
 *   그룹의 마지막 관리자는 빼거나 나갈 수 없다(last_manager). 남의 그룹 요청은 403.
 *
 * 토큰은 모두 Authorization: Bearer. /me는 기기 토큰, 나머지는 세션 토큰.
 * 오류 본문은 { error: '<코드>' } — 클라이언트(src/lib/family.ts)가 코드로 안내 문구를 고른다.
 */

/** Workers 타입 패키지 없이 쓰는 D1·KV 최소 인터페이스 */
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta?: { changes?: number } }>
}
interface D1Like {
  prepare(query: string): D1Stmt
  batch(statements: D1Stmt[]): Promise<unknown[]>
}
interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

interface Env {
  FAMILY_DB?: D1Like
  LLM_LIMIT?: KVLike
  /** Google OAuth 웹 클라이언트 ID (공개값, wrangler.toml [vars]) */
  GOOGLE_CLIENT_ID?: string
  /** 로컬 시험용 공개키 주소. 운영에는 두지 않는다(없으면 Google 주소) */
  GOOGLE_JWKS_URL?: string
}

interface PagesContext {
  request: Request
  env: Env
}

type Role = 'member' | 'viewer'
type UserRole = 'admin' | 'user'

interface MedPayload {
  kind: 'drug' | 'healthfood'
  itemSeq: string
  itemName: string
  manufacturer?: string
  mainIngredient?: string
  registeredAt: number
}

interface MemberRow {
  id: string
  group_id: string
  role: Role
  display_name: string
  token_hash: string | null
  user_id: string | null
  /** 보는 사람 행만: 1이면 그 그룹 관리자 (0003) */
  is_manager: number
  meds_json: string | null
  meds_updated_at: number | null
  last_seen_at: number | null
  created_at: number
}

interface GroupRow {
  id: string
  name: string
  created_at: number
  /** 만든 계정 (0003) */
  created_by: string | null
}

interface UserRow {
  id: string
  google_sub: string
  email: string | null
  name: string | null
  role: UserRole
  created_at: number
  last_login_at: number | null
}

interface InviteRow {
  group_id: string
  role: Role
  display_name: string
  member_id: string | null
}

const PREFIX = '/api/family/'
const ALLOWED_ORIGINS = ['https://pill.hgko.dev', 'https://pill-check.pages.dev']
/** 앱의 MAX_MEDICATIONS(src/lib/db.ts)와 같게 */
const MAX_MEDS = 20
const MAX_BODY_BYTES = 32 * 1024
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
/** 세션은 쓸 때마다 연장하되, 하루에 한 번만 DB에 쓴다 */
const SESSION_EXTEND_AFTER_MS = 24 * 60 * 60 * 1000
/** 계정 하나가 만들 수 있는 그룹 수 (가족 규모 추정, 확인 안 함) */
const MAX_GROUPS_PER_USER = 10
/** 그룹 하나의 구성원 + 보는 사람 합 (가족 규모 추정, 확인 안 함) */
const MAX_GROUP_PEOPLE = 20
/** 같은 IP에서 하루(한국 시간)에 받는 초대 코드 시도 수(미리보기 포함) */
const JOIN_DAILY_LIMIT = 30
/** 헷갈리는 글자(0 O 1 I L)를 뺀 31자 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 8
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']
/** 기기 시계 차이 허용(초) */
const CLOCK_SKEW_SEC = 60

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // 배포 미리보기 주소 (예: https://f1c8aac8.pill-check.pages.dev)
  if (/^https:\/\/[a-z0-9-]+\.pill-check\.pages\.dev$/.test(origin)) return true
  // 로컬 개발(wrangler pages dev). 토큰 방식이라 쿠키 위조 걱정은 없다
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function fail(code: string, status: number): Response {
  return json({ error: code }, status)
}

function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 치우침 없이 CODE_ALPHABET에서 8자 뽑기 (248 = 31 × 8 이상 값은 버림) */
function newInviteCode(): string {
  let code = ''
  while (code.length < CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % 31]
    }
  }
  return code
}

/** 사용자가 넣은 코드 정리: 공백·하이픈 제거, 대문자 */
function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

/** 한도를 넘었으면 true. KV가 없거나 오류면 막지 않는다 */
async function overJoinLimit(kv: KVLike | undefined, ip: string): Promise<boolean> {
  if (!kv || !ip) return false
  const key = `family-join:${ip}:${kstDate()}`
  try {
    const count = Number((await kv.get(key)) ?? '0') || 0
    if (count >= JOIN_DAILY_LIMIT) return true
    await kv.put(key, String(count + 1), { expirationTtl: 2 * 24 * 60 * 60 })
    return false
  } catch {
    return false
  }
}

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}

function bearer(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') ?? '')
  return m ? m[1] : null
}

/** 받은 약 목록에서 정해진 필드만 골라낸다. 모양이 틀리면 null */
function sanitizeMeds(raw: unknown): MedPayload[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_MEDS) return null
  const out: MedPayload[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null
    const r = m as Record<string, unknown>
    const kind = r.kind === 'drug' || r.kind === 'healthfood' ? r.kind : null
    const itemSeq = str(r.itemSeq, 40)
    const itemName = str(r.itemName, 200)
    if (!kind || !itemSeq || !itemName) return null
    out.push({
      kind,
      itemSeq,
      itemName,
      manufacturer: str(r.manufacturer, 200),
      mainIngredient: str(r.mainIngredient, 2000),
      registeredAt: typeof r.registeredAt === 'number' ? r.registeredAt : 0,
    })
  }
  return out
}

function parseMeds(text: string | null): MedPayload[] {
  if (!text) return []
  try {
    const v = JSON.parse(text) as unknown
    return Array.isArray(v) ? (v as MedPayload[]) : []
  } catch {
    return []
  }
}

/** 보는 사람·관리자에게 보여 주는 구성원 모양 */
function memberView(m: MemberRow & { account_email?: string | null }) {
  return {
    id: m.id,
    role: m.role,
    displayName: m.display_name,
    connected: m.token_hash !== null || m.user_id !== null,
    lastSeenAt: m.last_seen_at,
    medsUpdatedAt: m.meds_updated_at,
    meds: m.role === 'member' ? parseMeds(m.meds_json) : [],
    // 관리자 화면에서 보는 사람이 어느 계정인지 알아보게(관리자 조회에서만 채움)
    accountEmail: m.account_email ?? null,
  }
}

function userView(u: UserRow) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, lastLoginAt: u.last_login_at }
}

async function getGroup(db: D1Like, id: string): Promise<GroupRow | null> {
  return db.prepare('SELECT * FROM family_groups WHERE id = ?').bind(id).first<GroupRow>()
}

async function viewerNames(db: D1Like, groupId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT display_name FROM family_members WHERE group_id = ? AND role = 'viewer' AND (user_id IS NOT NULL OR token_hash IS NOT NULL) ORDER BY created_at",
    )
    .bind(groupId)
    .all<{ display_name: string }>()
  return results.map((r) => r.display_name)
}

// ---------- Google ID 토큰 검증 ----------

interface GoogleJwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

interface GoogleClaims {
  iss: string
  aud: string
  sub: string
  exp: number
  email?: string
  name?: string
}

/** 공개키는 응답의 Cache-Control max-age만큼 이 isolate 메모리에 둔다 */
let jwksCache: { url: string; keys: GoogleJwk[]; expiresAt: number } | null = null

async function getJwks(url: string, force: boolean): Promise<GoogleJwk[]> {
  const now = Date.now()
  if (!force && jwksCache && jwksCache.url === url && jwksCache.expiresAt > now) return jwksCache.keys
  const res = await fetch(url)
  if (!res.ok) throw new Error(`jwks ${res.status}`)
  const body = (await res.json()) as { keys?: GoogleJwk[] }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? '3600')
  jwksCache = { url, keys: body.keys ?? [], expiresAt: now + Math.max(60, maxAge) * 1000 }
  return jwksCache.keys
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64urlJson<T>(s: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T
  } catch {
    return null
  }
}

/** 서명(RS256)·발급자·대상(클라이언트 ID)·만료를 확인한다. 틀리면 null */
async function verifyGoogleIdToken(token: string, env: Env): Promise<GoogleClaims | null> {
  const clientId = env.GOOGLE_CLIENT_ID ?? ''
  const parts = token.split('.')
  if (!clientId || parts.length !== 3) return null
  const header = b64urlJson<{ alg?: string; kid?: string }>(parts[0])
  const claims = b64urlJson<GoogleClaims>(parts[1])
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) return null

  const url = env.GOOGLE_JWKS_URL || GOOGLE_JWKS_URL
  let jwk = (await getJwks(url, false)).find((k) => k.kid === header.kid)
  // 키가 바뀌었을 수 있어 한 번만 새로 받는다
  if (!jwk) jwk = (await getJwks(url, true)).find((k) => k.kid === header.kid)
  if (!jwk || jwk.kty !== 'RSA') return null

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!ok) return null

  const nowSec = Math.floor(Date.now() / 1000)
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return null
  if (claims.aud !== clientId) return null
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < nowSec) return null
  if (typeof claims.sub !== 'string' || !claims.sub) return null
  return claims
}

// ---------- 세션 ----------

async function findSessionUser(db: D1Like, request: Request): Promise<UserRow | null> {
  const token = bearer(request)
  if (!token) return null
  const hash = await sha256Hex(token)
  const now = Date.now()
  const row = await db
    .prepare(
      'SELECT u.*, s.expires_at AS session_expires_at FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
    .bind(hash, now)
    .first<UserRow & { session_expires_at: number }>()
  if (!row) return null
  // 쓸 때마다 연장 (하루에 한 번만 쓴다)
  if (row.session_expires_at - now < SESSION_TTL_MS - SESSION_EXTEND_AFTER_MS) {
    await db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_TTL_MS, hash).run()
  }
  return row
}

async function findMemberByToken(db: D1Like, request: Request): Promise<MemberRow | null> {
  const token = bearer(request)
  if (!token) return null
  const hash = await sha256Hex(token)
  return db.prepare('SELECT * FROM family_members WHERE token_hash = ?').bind(hash).first<MemberRow>()
}

// ---------- 처리 ----------

async function handleAuth(db: D1Like, env: Env, request: Request, method: string, sub: string): Promise<Response> {
  if (sub === 'config' && method === 'GET') {
    if (!env.GOOGLE_CLIENT_ID) return fail('not_configured', 500)
    return json({ googleClientId: env.GOOGLE_CLIENT_ID })
  }

  if (sub === 'google' && method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return fail('not_configured', 500)
    const body = await readBody<{ credential?: unknown }>(request)
    const credential = typeof body?.credential === 'string' ? body.credential : ''
    if (!credential || credential.length > 8192) return fail('bad_credential', 400)
    let claims: GoogleClaims | null
    try {
      claims = await verifyGoogleIdToken(credential, env)
    } catch {
      return fail('auth_unavailable', 502)
    }
    if (!claims) return fail('bad_credential', 401)

    const now = Date.now()
    const email = str(claims.email, 200) ?? null
    const name = str(claims.name, 100) ?? null
    let user = await db.prepare('SELECT * FROM auth_users WHERE google_sub = ?').bind(claims.sub).first<UserRow>()
    if (user) {
      await db
        .prepare('UPDATE auth_users SET email = ?, name = ?, last_login_at = ? WHERE id = ?')
        .bind(email, name, now, user.id)
        .run()
      user = { ...user, email, name, last_login_at: now }
    } else {
      // 새 계정은 일반 계정. 첫 관리자는 운영 DB에서 1회 지정한다(plan.md 48)
      const id = crypto.randomUUID()
      await db
        .prepare(
          "INSERT INTO auth_users (id, google_sub, email, name, role, created_at, last_login_at) VALUES (?, ?, ?, ?, 'user', ?, ?)",
        )
        .bind(id, claims.sub, email, name, now, now)
        .run()
      user = { id, google_sub: claims.sub, email, name, role: 'user', created_at: now, last_login_at: now }
    }

    const token = newToken()
    await db
      .prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), user.id, now, now + SESSION_TTL_MS)
      .run()
    return json({ token, user: userView(user) })
  }

  if (sub === 'me' && method === 'GET') {
    const user = await findSessionUser(db, request)
    if (!user) return fail('bad_session', 401)
    return json({ user: userView(user) })
  }

  if (sub === 'logout' && method === 'POST') {
    const token = bearer(request)
    if (token) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
    return json({ ok: true })
  }

  return fail('not_found', 404)
}

/** 아직 쓰지 않았고 기한이 남은 초대 */
async function findOpenInvite(db: D1Like, codeHash: string, now: number): Promise<InviteRow | null> {
  return db
    .prepare('SELECT * FROM family_invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(codeHash, now)
    .first<InviteRow>()
}

async function handlePreview(db: D1Like, env: Env, request: Request, url: URL): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (await overJoinLimit(env.LLM_LIMIT, ip)) return fail('too_many', 429)
  const code = normalizeCode(url.searchParams.get('code') ?? '')
  if (code.length !== CODE_LENGTH) return fail('invalid_code', 400)
  const invite = await findOpenInvite(db, await sha256Hex(code), Date.now())
  if (!invite) return fail('invalid_code', 400)
  const group = await getGroup(db, invite.group_id)
  if (!group) return fail('invalid_code', 400)
  return json({ role: invite.role, groupName: group.name, displayName: invite.display_name })
}

async function handleJoin(db: D1Like, env: Env, request: Request): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (await overJoinLimit(env.LLM_LIMIT, ip)) return fail('too_many', 429)

  const body = await readBody<{ code?: unknown }>(request)
  const code = typeof body?.code === 'string' ? normalizeCode(body.code) : ''
  if (code.length !== CODE_LENGTH) return fail('invalid_code', 400)

  const now = Date.now()
  const codeHash = await sha256Hex(code)
  const invite = await findOpenInvite(db, codeHash, now)
  if (!invite) return fail('invalid_code', 400)

  const group = await getGroup(db, invite.group_id)
  if (!group) return fail('invalid_code', 400)

  // 보는 사람은 계정으로 잇는다. 로그인 전이면 코드를 쓰지 않고 돌려보낸다
  let user: UserRow | null = null
  if (invite.role === 'viewer') {
    user = await findSessionUser(db, request)
    if (!user) return fail('login_required', 400)
  }

  let existing: MemberRow | null = null
  if (invite.member_id) {
    existing = await db
      .prepare("SELECT * FROM family_members WHERE id = ? AND group_id = ? AND role = 'member'")
      .bind(invite.member_id, invite.group_id)
      .first<MemberRow>()
    if (!existing) return fail('invalid_code', 400)
  }

  // 그룹 인원 상한 (다시 잇기와 이미 들어와 있는 계정은 인원이 늘지 않으니 뺀다)
  if (!existing) {
    const already = user ? await myRowInGroup(db, user.id, group.id) : null
    if (!already && (await peopleCount(db, group.id)) >= MAX_GROUP_PEOPLE) return fail('group_full', 400)
  }

  // 같은 코드가 동시에 두 번 쓰이지 않게, 먼저 "사용됨"으로 바꾼 쪽만 진행
  const claim = await db
    .prepare('UPDATE family_invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL')
    .bind(now, codeHash)
    .run()
  if ((claim.meta?.changes ?? 0) !== 1) return fail('invalid_code', 400)

  if (user) {
    const already = await db
      .prepare("SELECT id FROM family_members WHERE group_id = ? AND role = 'viewer' AND user_id = ?")
      .bind(group.id, user.id)
      .first<{ id: string }>()
    if (!already) {
      await db
        .prepare(
          "INSERT INTO family_members (id, group_id, role, display_name, user_id, last_seen_at, created_at) VALUES (?, ?, 'viewer', ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), group.id, invite.display_name, user.id, now, now)
        .run()
    }
    return json({ role: 'viewer', displayName: invite.display_name, group: { id: group.id, name: group.name }, meds: [] })
  }

  const token = newToken()
  const tokenHash = await sha256Hex(token)

  if (existing) {
    // 다시 잇기: 같은 행에 새 토큰. 이전 기기의 토큰은 더 못 쓴다
    await db
      .prepare('UPDATE family_members SET token_hash = ?, last_seen_at = ? WHERE id = ?')
      .bind(tokenHash, now, existing.id)
      .run()
    return json({
      token,
      role: 'member',
      displayName: existing.display_name,
      group: { id: group.id, name: group.name },
      meds: parseMeds(existing.meds_json),
    })
  }

  await db
    .prepare(
      "INSERT INTO family_members (id, group_id, role, display_name, token_hash, last_seen_at, created_at) VALUES (?, ?, 'member', ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), group.id, invite.display_name, tokenHash, now, now)
    .run()
  return json({
    token,
    role: 'member',
    displayName: invite.display_name,
    group: { id: group.id, name: group.name },
    meds: [],
  })
}

async function handleMe(db: D1Like, request: Request, method: string, sub: string): Promise<Response> {
  const me = await findMemberByToken(db, request)
  if (!me) return fail('bad_token', 401)
  if (me.role !== 'member') return fail('forbidden', 403)
  const now = Date.now()

  if (sub === '' && method === 'GET') {
    const group = await getGroup(db, me.group_id)
    await db.prepare('UPDATE family_members SET last_seen_at = ? WHERE id = ?').bind(now, me.id).run()
    return json({
      role: me.role,
      displayName: me.display_name,
      group: group ? { id: group.id, name: group.name } : null,
      viewers: await viewerNames(db, me.group_id),
    })
  }

  if (sub === '' && method === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM family_invites WHERE member_id = ?').bind(me.id),
      db.prepare('DELETE FROM family_members WHERE id = ?').bind(me.id),
    ])
    return json({ ok: true })
  }

  if (sub === 'meds' && method === 'PUT') {
    const body = await readBody<{ meds?: unknown }>(request)
    const meds = sanitizeMeds(body?.meds)
    if (!meds) return fail('bad_request', 400)
    await db
      .prepare('UPDATE family_members SET meds_json = ?, meds_updated_at = ?, last_seen_at = ? WHERE id = ?')
      .bind(JSON.stringify(meds), now, now, me.id)
      .run()
    return json({ ok: true, count: meds.length })
  }

  return fail('not_found', 404)
}

// ---------- 그룹 (plan.md 50: 그룹별 관리자) ----------

/** 그룹 안 보는 사람(계정) 행 + 계정 메일 */
type ViewerRow = MemberRow & { account_email: string | null }

/** 이 그룹에서 나의 보는 사람 행. 없으면 이 그룹에 속하지 않음 */
async function myRowInGroup(db: D1Like, userId: string, groupId: string): Promise<MemberRow | null> {
  return db
    .prepare("SELECT * FROM family_members WHERE group_id = ? AND role = 'viewer' AND user_id = ?")
    .bind(groupId, userId)
    .first<MemberRow>()
}

async function managerCount(db: D1Like, groupId: string): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM family_members WHERE group_id = ? AND role = 'viewer' AND is_manager = 1")
    .bind(groupId)
    .first<{ n: number }>()
  return r?.n ?? 0
}

async function peopleCount(db: D1Like, groupId: string): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM family_members WHERE group_id = ?').bind(groupId).first<{ n: number }>()
  return r?.n ?? 0
}

/** 그룹 하나를 화면에 줄 모양으로. 관리자에게만 보는 사람 메일과 초대 중 목록을 준다 */
async function groupView(db: D1Like, group: GroupRow, me: MemberRow, now: number) {
  const isManager = me.is_manager === 1
  const { results: members } = await db
    .prepare("SELECT * FROM family_members WHERE group_id = ? AND role = 'member' ORDER BY created_at")
    .bind(group.id)
    .all<MemberRow>()
  const { results: viewers } = await db
    .prepare(
      "SELECT m.*, u.email AS account_email FROM family_members m LEFT JOIN auth_users u ON u.id = m.user_id WHERE m.group_id = ? AND m.role = 'viewer' ORDER BY m.is_manager DESC, m.created_at",
    )
    .bind(group.id)
    .all<ViewerRow>()
  const pendingInvites = isManager
    ? (
        await db
          .prepare(
            // 초대 행은 code_hash가 키라, 취소할 때 가리킬 값으로 SQLite rowid를 쓴다 (plan.md 55)
            'SELECT rowid AS id, role, display_name, member_id, expires_at FROM family_invites WHERE group_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at',
          )
          .bind(group.id, now)
          .all<{ id: number; role: Role; display_name: string; member_id: string | null; expires_at: number }>()
      ).results.map((i) => ({
        id: String(i.id),
        role: i.role,
        displayName: i.display_name,
        memberId: i.member_id,
        expiresAt: i.expires_at,
      }))
    : []
  return {
    id: group.id,
    name: group.name,
    isManager,
    members: members.map((m) => memberView(m)),
    viewers: viewers.map((v) => ({
      id: v.id,
      displayName: v.display_name,
      isManager: v.is_manager === 1,
      isMe: v.id === me.id,
      // 메일은 그 그룹 관리자에게만
      accountEmail: isManager ? v.account_email : null,
    })),
    pendingInvites,
  }
}

async function handleView(db: D1Like, request: Request): Promise<Response> {
  const user = await findSessionUser(db, request)
  if (!user) return fail('bad_session', 401)
  const now = Date.now()
  const { results: mine } = await db
    .prepare("SELECT * FROM family_members WHERE role = 'viewer' AND user_id = ? ORDER BY created_at")
    .bind(user.id)
    .all<MemberRow>()
  const groups = []
  for (const me of mine) {
    const group = await getGroup(db, me.group_id)
    if (!group) continue
    await db.prepare('UPDATE family_members SET last_seen_at = ? WHERE id = ?').bind(now, me.id).run()
    groups.push(await groupView(db, group, me, now))
  }
  return json({ groups })
}

async function handleGroups(db: D1Like, request: Request, method: string, parts: string[]): Promise<Response> {
  const user = await findSessionUser(db, request)
  if (!user) return fail('bad_session', 401)
  const now = Date.now()
  const [groupId, sub, targetId] = parts

  // 그룹 만들기: 로그인한 누구나. 만든 사람이 그 그룹의 관리자
  if (!groupId && method === 'POST') {
    const body = await readBody<{ name?: unknown }>(request)
    const name = str(body?.name, 40)
    if (!name) return fail('bad_request', 400)
    const owned = await db
      .prepare('SELECT COUNT(*) AS n FROM family_groups WHERE created_by = ?')
      .bind(user.id)
      .first<{ n: number }>()
    if ((owned?.n ?? 0) >= MAX_GROUPS_PER_USER) return fail('too_many_groups', 400)
    const id = crypto.randomUUID()
    await db.batch([
      db.prepare('INSERT INTO family_groups (id, name, created_at, created_by) VALUES (?, ?, ?, ?)').bind(id, name, now, user.id),
      db
        .prepare(
          "INSERT INTO family_members (id, group_id, role, display_name, user_id, is_manager, last_seen_at, created_at) VALUES (?, ?, 'viewer', ?, ?, 1, ?, ?)",
        )
        .bind(crypto.randomUUID(), id, (user.name ?? user.email ?? '관리자').slice(0, 20), user.id, now, now),
    ])
    return json({ id, name })
  }

  if (!groupId) return fail('not_found', 404)
  const group = await getGroup(db, groupId)
  const me = group ? await myRowInGroup(db, user.id, groupId) : null
  // 남의 그룹이면 있는지 없는지도 알리지 않는다
  if (!group || !me) return fail('forbidden', 403)

  // 그룹 나가기: 함께 보는 가족 누구나. 마지막 관리자는 못 나간다(그룹 지우기를 쓴다)
  if (sub === 'leave' && !targetId && method === 'POST') {
    if (me.is_manager === 1 && (await managerCount(db, groupId)) <= 1) return fail('last_manager', 400)
    await db.prepare('DELETE FROM family_members WHERE id = ?').bind(me.id).run()
    return json({ ok: true })
  }

  // 여기부터는 그 그룹 관리자만
  if (me.is_manager !== 1) return fail('forbidden', 403)

  if (!sub && method === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM family_invites WHERE group_id = ?').bind(groupId),
      db.prepare('DELETE FROM family_members WHERE group_id = ?').bind(groupId),
      db.prepare('DELETE FROM family_groups WHERE id = ?').bind(groupId),
    ])
    return json({ ok: true })
  }

  if (sub === 'invites' && !targetId && method === 'POST') {
    const body = await readBody<{ role?: unknown; displayName?: unknown; memberId?: unknown }>(request)
    const memberId = str(body?.memberId, 64)
    let role: Role
    let displayName: string | undefined
    if (memberId) {
      // 다시 잇기는 구성원(기기 토큰)만. 보는 사람은 계정이라 다시 이을 필요가 없다
      const m = await db
        .prepare("SELECT * FROM family_members WHERE id = ? AND group_id = ? AND role = 'member'")
        .bind(memberId, groupId)
        .first<MemberRow>()
      if (!m) return fail('not_found', 404)
      role = 'member'
      displayName = m.display_name
    } else {
      if (body?.role !== 'member' && body?.role !== 'viewer') return fail('bad_request', 400)
      role = body.role
      displayName = str(body?.displayName, 20)
      if ((await peopleCount(db, groupId)) >= MAX_GROUP_PEOPLE) return fail('group_full', 400)
    }
    if (!displayName) return fail('bad_request', 400)

    const code = newInviteCode()
    const expiresAt = now + INVITE_TTL_MS
    await db
      .prepare(
        'INSERT INTO family_invites (code_hash, group_id, role, display_name, member_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(await sha256Hex(code), groupId, role, displayName, memberId ?? null, expiresAt, now)
      .run()
    return json({ code, role, displayName, expiresAt })
  }

  // 초대 취소: 아직 안 쓴 이 그룹 초대만 (plan.md 55)
  if (sub === 'invites' && targetId && method === 'DELETE') {
    if (!/^\d{1,15}$/.test(targetId)) return fail('not_found', 404)
    const r = await db
      .prepare('DELETE FROM family_invites WHERE rowid = ? AND group_id = ? AND used_at IS NULL')
      .bind(Number(targetId), groupId)
      .run()
    if (!r.meta?.changes) return fail('not_found', 404)
    return json({ ok: true })
  }

  if (sub === 'members' && targetId) {
    const target = await db
      .prepare('SELECT * FROM family_members WHERE id = ? AND group_id = ?')
      .bind(targetId, groupId)
      .first<MemberRow>()
    if (!target) return fail('not_found', 404)

    if (method === 'DELETE') {
      if (target.role === 'viewer' && target.is_manager === 1 && (await managerCount(db, groupId)) <= 1) {
        return fail('last_manager', 400)
      }
      await db.batch([
        db.prepare('DELETE FROM family_invites WHERE member_id = ?').bind(target.id),
        db.prepare('DELETE FROM family_members WHERE id = ?').bind(target.id),
      ])
      return json({ ok: true })
    }

    if (method === 'PUT') {
      // 관리 권한은 계정이 있는 함께 보는 가족에게만 줄 수 있다
      if (target.role !== 'viewer') return fail('bad_request', 400)
      const body = await readBody<{ isManager?: unknown }>(request)
      if (typeof body?.isManager !== 'boolean') return fail('bad_request', 400)
      if (!body.isManager && target.is_manager === 1 && (await managerCount(db, groupId)) <= 1) {
        return fail('last_manager', 400)
      }
      await db.prepare('UPDATE family_members SET is_manager = ? WHERE id = ?').bind(body.isManager ? 1 : 0, target.id).run()
      return json({ ok: true })
    }
  }

  return fail('not_found', 404)
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context
  const origin = request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) return fail('forbidden_origin', 403)

  const db = env.FAMILY_DB
  if (!db) return fail('not_configured', 500)

  const url = new URL(request.url)
  const parts = url.pathname.slice(PREFIX.length).split('/').filter(Boolean)
  const method = request.method

  try {
    if (parts[0] === 'auth' && parts.length === 2) return await handleAuth(db, env, request, method, parts[1])
    if (parts[0] === 'invite' && parts.length === 1 && method === 'GET') return await handlePreview(db, env, request, url)
    if (parts[0] === 'join' && parts.length === 1 && method === 'POST') return await handleJoin(db, env, request)
    if (parts[0] === 'me' && parts.length <= 2) return await handleMe(db, request, method, parts[1] ?? '')
    if (parts[0] === 'view' && parts.length === 1 && method === 'GET') return await handleView(db, request)
    if (parts[0] === 'groups' && parts.length <= 4) return await handleGroups(db, request, method, parts.slice(1))
    return fail('not_found', 404)
  } catch {
    return fail('server_error', 500)
  }
}
