/**
 * LLM 클라이언트 helper.
 *
 * Production: /api/llm (Vercel Edge Function, 키 서버측만)
 * Local dev: VITE_GEMINI_API_KEY 있으면 직접 호출, 없으면 친화 에러
 *
 * 일일 quota: 5회 (사용자별 localStorage)
 * 응답 캐시: 30일, 최대 20건 (LRU) — 같은 조합 재방문 시 쿼터 안 소비
 */

const QUOTA_KEY = 'pillcheck.llmQuota'
const CACHE_KEY = 'pillcheck.llmCache'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일
const CACHE_MAX_ENTRIES = 20
export const LLM_DAILY_LIMIT = 5

interface CacheEntry {
  text: string
  cachedAt: number
  lastUsed: number
}
type CacheMap = Record<string, CacheEntry>

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as CacheMap
  } catch {
    return {}
  }
}

function saveCache(cache: CacheMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota exceeded 등 무시 */
  }
}

/** 간단한 djb2 해시 — 프롬프트 → 캐시 키 */
function hashKey(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

export function getCachedExplanation(prompt: string): string | null {
  const cache = loadCache()
  const key = hashKey(prompt)
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    delete cache[key]
    saveCache(cache)
    return null
  }
  // LRU 갱신
  entry.lastUsed = Date.now()
  cache[key] = entry
  saveCache(cache)
  return entry.text
}

function setCachedExplanation(prompt: string, text: string): void {
  const cache = loadCache()
  const key = hashKey(prompt)
  const now = Date.now()
  cache[key] = { text, cachedAt: now, lastUsed: now }

  // LRU: 20건 초과 시 가장 오래 안 쓴 항목 제거
  const keys = Object.keys(cache)
  if (keys.length > CACHE_MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => cache[a].lastUsed - cache[b].lastUsed)
    const toRemove = sorted.slice(0, keys.length - CACHE_MAX_ENTRIES)
    for (const k of toRemove) delete cache[k]
  }
  saveCache(cache)
}

interface QuotaState {
  date: string // YYYY-MM-DD
  count: number
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getRemainingQuota(): number {
  try {
    const raw = localStorage.getItem(QUOTA_KEY)
    if (!raw) return LLM_DAILY_LIMIT
    const state = JSON.parse(raw) as QuotaState
    if (state.date !== todayStr()) return LLM_DAILY_LIMIT
    return Math.max(0, LLM_DAILY_LIMIT - state.count)
  } catch {
    return LLM_DAILY_LIMIT
  }
}

function incrementQuota(): void {
  try {
    const today = todayStr()
    const raw = localStorage.getItem(QUOTA_KEY)
    let state: QuotaState
    if (raw) {
      const prev = JSON.parse(raw) as QuotaState
      state = prev.date === today ? { date: today, count: prev.count + 1 } : { date: today, count: 1 }
    } else {
      state = { date: today, count: 1 }
    }
    localStorage.setItem(QUOTA_KEY, JSON.stringify(state))
  } catch {
    /* localStorage 실패 무시 (privacy mode 등) */
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super(`오늘 AI 해설 사용 한도(${LLM_DAILY_LIMIT}회)를 다 쓰셨어요. 내일 다시 시도해주세요.`)
    this.name = 'QuotaExceededError'
  }
}

export class DevLLMUnavailableError extends Error {
  constructor() {
    super(
      'AI 해설은 Vercel 배포본에서만 동작합니다. (로컬 dev에서 테스트하려면 .env에 VITE_GEMINI_API_KEY 추가)',
    )
    this.name = 'DevLLMUnavailableError'
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  promptFeedback?: { blockReason?: string }
}

async function callGeminiDirect(prompt: string, key: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800, topP: 0.95 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini API 오류 (${res.status})`)
  const data = (await res.json()) as GeminiResponse
  if (data.promptFeedback?.blockReason) {
    throw new Error(`안전 필터 차단 (${data.promptFeedback.blockReason})`)
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('AI 응답이 비어있습니다 (안전 필터 가능성)')
  return text
}

async function callApiRoute(prompt: string): Promise<string> {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  let data: { text?: string; error?: string; detail?: string } = {}
  try {
    data = await res.json()
  } catch {
    /* noop */
  }
  if (!res.ok) {
    const msg = data.error || `LLM API 오류 (${res.status})`
    throw new Error(msg)
  }
  if (!data.text) throw new Error('AI 응답이 비어있습니다')
  return data.text
}

export interface ExplanationResult {
  text: string
  fromCache: boolean
}

export async function generateExplanation(prompt: string): Promise<ExplanationResult> {
  // 캐시 히트 — 쿼터 차감 안 함
  const cached = getCachedExplanation(prompt)
  if (cached) return { text: cached, fromCache: true }

  if (getRemainingQuota() === 0) throw new QuotaExceededError()

  const isDev = import.meta.env.DEV
  const directKey = isDev ? import.meta.env.VITE_GEMINI_API_KEY : null

  let text: string
  if (directKey) {
    text = await callGeminiDirect(prompt, directKey as string)
  } else if (isDev) {
    throw new DevLLMUnavailableError()
  } else {
    text = await callApiRoute(prompt)
  }

  incrementQuota()
  setCachedExplanation(prompt, text)
  return { text, fromCache: false }
}
