/**
 * Cloudflare Pages Function — 가족 연결 (plan.md 41)
 *
 * 로그인 없이 초대 코드로 기기를 잇는다. 기기는 무작위 토큰을 받아 보관하고,
 * 서버(D1 FAMILY_DB)에는 토큰·코드의 SHA-256 해시만 둔다.
 *
 *   POST   /api/family/join              { code } → { token, role, displayName, group, meds }
 *   GET    /api/family/me                (토큰) 내 그룹과 볼 수 있는 사람
 *   PUT    /api/family/me/meds           (구성원 토큰) { meds } 등록약 목록 통째로 올리기
 *   DELETE /api/family/me                (토큰) 연결 끊기 = 서버의 내 정보 지우기
 *   GET    /api/family/view              (보는 사람 토큰) 내 그룹 구성원의 약
 *   GET    /api/family/admin/groups      (관리자 키) 모든 그룹·구성원·약
 *   POST   /api/family/admin/groups      (관리자 키) { name }
 *   DELETE /api/family/admin/groups/:id  (관리자 키)
 *   POST   /api/family/admin/invites     (관리자 키) { groupId, role, displayName, memberId? }
 *   DELETE /api/family/admin/members/:id (관리자 키)
 *
 * 토큰은 Authorization: Bearer, 관리자 키(Pages Secret FAMILY_ADMIN_KEY)는 X-Admin-Key 헤더.
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
  FAMILY_ADMIN_KEY?: string
  LLM_LIMIT?: KVLike
}

interface PagesContext {
  request: Request
  env: Env
}

type Role = 'member' | 'viewer'

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
  meds_json: string | null
  meds_updated_at: number | null
  last_seen_at: number | null
  created_at: number
}

interface GroupRow {
  id: string
  name: string
  created_at: number
}

const PREFIX = '/api/family/'
const ALLOWED_ORIGINS = ['https://pill.hgko.dev', 'https://pill-check.pages.dev']
/** 앱의 MAX_MEDICATIONS(src/lib/db.ts)와 같게 */
const MAX_MEDS = 10
const MAX_BODY_BYTES = 32 * 1024
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** 같은 IP에서 하루(한국 시간)에 받는 초대 코드 시도 수 */
const JOIN_DAILY_LIMIT = 30
/** 헷갈리는 글자(0 O 1 I L)를 뺀 31자 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 8

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

/** 길이가 달라도 시간 차이로 새지 않게 해시끼리 비교 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i)
  return diff === 0
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
function memberView(m: MemberRow) {
  return {
    id: m.id,
    role: m.role,
    displayName: m.display_name,
    connected: m.token_hash !== null,
    lastSeenAt: m.last_seen_at,
    medsUpdatedAt: m.meds_updated_at,
    meds: m.role === 'member' ? parseMeds(m.meds_json) : [],
  }
}

async function findByToken(db: D1Like, request: Request): Promise<MemberRow | null> {
  const auth = request.headers.get('Authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/.exec(auth)
  if (!m) return null
  const hash = await sha256Hex(m[1])
  return db.prepare('SELECT * FROM family_members WHERE token_hash = ?').bind(hash).first<MemberRow>()
}

async function getGroup(db: D1Like, id: string): Promise<GroupRow | null> {
  return db.prepare('SELECT * FROM family_groups WHERE id = ?').bind(id).first<GroupRow>()
}

async function viewerNames(db: D1Like, groupId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT display_name FROM family_members WHERE group_id = ? AND role = 'viewer' AND token_hash IS NOT NULL ORDER BY created_at",
    )
    .bind(groupId)
    .all<{ display_name: string }>()
  return results.map((r) => r.display_name)
}

// ---------- 처리 ----------

async function handleJoin(db: D1Like, env: Env, request: Request): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (await overJoinLimit(env.LLM_LIMIT, ip)) return fail('too_many', 429)

  const body = await readBody<{ code?: unknown }>(request)
  const code = typeof body?.code === 'string' ? normalizeCode(body.code) : ''
  if (code.length !== CODE_LENGTH) return fail('invalid_code', 400)

  const now = Date.now()
  const codeHash = await sha256Hex(code)
  const invite = await db
    .prepare('SELECT * FROM family_invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(codeHash, now)
    .first<{ group_id: string; role: Role; display_name: string; member_id: string | null }>()
  if (!invite) return fail('invalid_code', 400)

  const group = await getGroup(db, invite.group_id)
  if (!group) return fail('invalid_code', 400)

  let existing: MemberRow | null = null
  if (invite.member_id) {
    existing = await db
      .prepare('SELECT * FROM family_members WHERE id = ? AND group_id = ?')
      .bind(invite.member_id, invite.group_id)
      .first<MemberRow>()
    if (!existing) return fail('invalid_code', 400)
  }

  // 같은 코드가 동시에 두 번 쓰이지 않게, 먼저 "사용됨"으로 바꾼 쪽만 진행
  const claim = await db
    .prepare('UPDATE family_invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL')
    .bind(now, codeHash)
    .run()
  if ((claim.meta?.changes ?? 0) !== 1) return fail('invalid_code', 400)

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
      role: existing.role,
      displayName: existing.display_name,
      group: { id: group.id, name: group.name },
      meds: existing.role === 'member' ? parseMeds(existing.meds_json) : [],
    })
  }

  await db
    .prepare(
      'INSERT INTO family_members (id, group_id, role, display_name, token_hash, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), group.id, invite.role, invite.display_name, tokenHash, now, now)
    .run()
  return json({
    token,
    role: invite.role,
    displayName: invite.display_name,
    group: { id: group.id, name: group.name },
    meds: [],
  })
}

async function handleMe(db: D1Like, request: Request, method: string, sub: string): Promise<Response> {
  const me = await findByToken(db, request)
  if (!me) return fail('bad_token', 401)
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
    if (me.role !== 'member') return fail('forbidden', 403)
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

async function handleView(db: D1Like, request: Request): Promise<Response> {
  const me = await findByToken(db, request)
  if (!me) return fail('bad_token', 401)
  if (me.role !== 'viewer') return fail('forbidden', 403)
  const group = await getGroup(db, me.group_id)
  if (!group) return fail('not_found', 404)
  await db.prepare('UPDATE family_members SET last_seen_at = ? WHERE id = ?').bind(Date.now(), me.id).run()
  const { results } = await db
    .prepare("SELECT * FROM family_members WHERE group_id = ? AND role = 'member' ORDER BY created_at")
    .bind(group.id)
    .all<MemberRow>()
  return json({
    group: { id: group.id, name: group.name },
    members: results.map(memberView),
    viewers: await viewerNames(db, group.id),
  })
}

async function handleAdmin(
  db: D1Like,
  env: Env,
  request: Request,
  method: string,
  parts: string[],
): Promise<Response> {
  const adminKey = env.FAMILY_ADMIN_KEY ?? ''
  if (!adminKey) return fail('not_configured', 500)
  const given = request.headers.get('X-Admin-Key') ?? ''
  if (!given || !(await safeEqual(given, adminKey))) return fail('bad_admin_key', 401)

  const [resource, id] = parts
  const now = Date.now()

  if (resource === 'groups' && !id && method === 'GET') {
    const groups = (await db.prepare('SELECT * FROM family_groups ORDER BY created_at').all<GroupRow>()).results
    const members = (await db.prepare('SELECT * FROM family_members ORDER BY created_at').all<MemberRow>()).results
    const invites = (
      await db
        .prepare(
          'SELECT group_id, role, display_name, member_id, expires_at FROM family_invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at',
        )
        .bind(now)
        .all<{ group_id: string; role: Role; display_name: string; member_id: string | null; expires_at: number }>()
    ).results
    return json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        members: members.filter((m) => m.group_id === g.id).map(memberView),
        pendingInvites: invites
          .filter((i) => i.group_id === g.id)
          .map((i) => ({ role: i.role, displayName: i.display_name, memberId: i.member_id, expiresAt: i.expires_at })),
      })),
    })
  }

  if (resource === 'groups' && !id && method === 'POST') {
    const body = await readBody<{ name?: unknown }>(request)
    const name = str(body?.name, 40)
    if (!name) return fail('bad_request', 400)
    const groupId = crypto.randomUUID()
    await db
      .prepare('INSERT INTO family_groups (id, name, created_at) VALUES (?, ?, ?)')
      .bind(groupId, name, now)
      .run()
    return json({ id: groupId, name })
  }

  if (resource === 'groups' && id && method === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM family_invites WHERE group_id = ?').bind(id),
      db.prepare('DELETE FROM family_members WHERE group_id = ?').bind(id),
      db.prepare('DELETE FROM family_groups WHERE id = ?').bind(id),
    ])
    return json({ ok: true })
  }

  if (resource === 'invites' && !id && method === 'POST') {
    const body = await readBody<{ groupId?: unknown; role?: unknown; displayName?: unknown; memberId?: unknown }>(
      request,
    )
    const groupId = str(body?.groupId, 64)
    const memberId = str(body?.memberId, 64)
    if (!groupId || !(await getGroup(db, groupId))) return fail('not_found', 404)

    let role: Role
    let displayName: string | undefined
    if (memberId) {
      const m = await db
        .prepare('SELECT * FROM family_members WHERE id = ? AND group_id = ?')
        .bind(memberId, groupId)
        .first<MemberRow>()
      if (!m) return fail('not_found', 404)
      role = m.role
      displayName = m.display_name
    } else {
      if (body?.role !== 'member' && body?.role !== 'viewer') return fail('bad_request', 400)
      role = body.role
      displayName = str(body?.displayName, 20)
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

  if (resource === 'members' && id && method === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM family_invites WHERE member_id = ?').bind(id),
      db.prepare('DELETE FROM family_members WHERE id = ?').bind(id),
    ])
    return json({ ok: true })
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
    if (parts[0] === 'join' && parts.length === 1 && method === 'POST') return await handleJoin(db, env, request)
    if (parts[0] === 'me' && parts.length <= 2) return await handleMe(db, request, method, parts[1] ?? '')
    if (parts[0] === 'view' && parts.length === 1 && method === 'GET') return await handleView(db, request)
    if (parts[0] === 'admin' && parts.length >= 2 && parts.length <= 3) {
      return await handleAdmin(db, env, request, method, parts.slice(1))
    }
    return fail('not_found', 404)
  } catch {
    return fail('server_error', 500)
  }
}
