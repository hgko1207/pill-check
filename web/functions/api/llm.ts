/**
 * Cloudflare Pages Function — Gemini Flash 호출 프록시
 *
 * 클라이언트가 /api/llm 으로 POST → 이 함수가 서버측 GEMINI_API_KEY로
 * Gemini API에 전달 → 응답을 클라이언트에 반환.
 *
 * 환경변수 (Cloudflare Pages → Settings → Variables and Secrets, Encrypt):
 *   GEMINI_API_KEY
 *
 * 키는 서버에만 존재하며 클라이언트 번들에 포함되지 않습니다.
 * POST가 아닌 요청은 onRequest에서 405로 돌려준다.
 * 다른 사이트 Origin은 403, 같은 IP의 하루 호출이 IP_DAILY_LIMIT를 넘으면 429
 * (횟수는 KV 바인딩 LLM_LIMIT, web/wrangler.toml).
 */

/** Workers 타입 패키지 없이 쓰는 KV 최소 인터페이스 */
interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

interface Env {
  GEMINI_API_KEY?: string
  LLM_LIMIT?: KVLike
}

/** 같은 IP에서 하루(한국 시간)에 받는 최대 호출 수. 기기별 5회 × 집 안 여러 기기를 감안 */
const IP_DAILY_LIMIT = 20

const ALLOWED_ORIGINS = ['https://pill.hgko.dev', 'https://pill-check.pages.dev']

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // 배포 미리보기 주소 (예: https://f1c8aac8.pill-check.pages.dev)
  return /^https:\/\/[a-z0-9-]+\.pill-check\.pages\.dev$/.test(origin)
}

function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 한도를 넘었으면 true. KV가 없거나 오류면 막지 않는다(앱이 멈추지 않게) */
async function overIpLimit(kv: KVLike | undefined, ip: string): Promise<boolean> {
  if (!kv || !ip) return false
  const key = `llm:${ip}:${kstDate()}`
  try {
    const count = Number((await kv.get(key)) ?? '0') || 0
    // 막힌 요청은 쓰지 않는다 — KV 쓰기 한도를 아끼려고
    if (count >= IP_DAILY_LIMIT) return true
    await kv.put(key, String(count + 1), { expirationTtl: 2 * 24 * 60 * 60 })
    return false
  } catch {
    return false
  }
}

interface PagesContext {
  request: Request
  env: Env
}

interface LLMRequestBody {
  prompt?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
    safetyRatings?: unknown
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const apiKey = context.env.GEMINI_API_KEY ?? ''

  if (!apiKey) {
    return jsonResponse(
      {
        error:
          'GEMINI_API_KEY가 서버에 설정되지 않았습니다. Cloudflare Pages Settings → Variables and Secrets 에 추가하세요.',
      },
      500,
    )
  }

  let body: LLMRequestBody
  try {
    body = (await context.request.json()) as LLMRequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const prompt = body.prompt
  if (!prompt || typeof prompt !== 'string') {
    return jsonResponse({ error: 'prompt(string)이 필요합니다' }, 400)
  }
  if (prompt.length > 4000) {
    return jsonResponse({ error: 'prompt가 너무 깁니다 (최대 4000자)' }, 400)
  }

  // 다른 사이트에서 부르는 것 막기 (Origin 없는 요청은 아래 횟수 제한이 맡는다)
  const origin = context.request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse({ error: '허용되지 않은 출처입니다' }, 403)
  }

  const ip = context.request.headers.get('CF-Connecting-IP') ?? ''
  if (await overIpLimit(context.env.LLM_LIMIT, ip)) {
    return jsonResponse(
      { error: `오늘 AI 해설 사용 한도(${IP_DAILY_LIMIT}회)를 넘었어요. 내일 다시 해 보세요.` },
      429,
    )
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`

  let geminiResp: Response
  try {
    geminiResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
          topP: 0.95,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    })
  } catch {
    return jsonResponse(
      { error: 'Gemini API 호출에 실패했습니다 (네트워크 오류).' },
      502,
    )
  }

  if (!geminiResp.ok) {
    let detail = ''
    try {
      detail = (await geminiResp.text()).slice(0, 200)
    } catch {
      /* noop */
    }
    return jsonResponse(
      {
        error: `Gemini API 응답 오류 (${geminiResp.status})`,
        detail,
      },
      502,
    )
  }

  const data = (await geminiResp.json()) as GeminiResponse

  if (data.promptFeedback?.blockReason) {
    return jsonResponse(
      { error: `안전 필터로 응답이 차단되었습니다 (${data.promptFeedback.blockReason})` },
      502,
    )
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) {
    return jsonResponse(
      { error: 'AI 응답이 비어있습니다 (안전 필터 가능성)' },
      502,
    )
  }

  return jsonResponse({ text })
}
