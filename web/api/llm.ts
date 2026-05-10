/**
 * Vercel Edge Function — Gemini Flash 호출 프록시
 *
 * 클라이언트가 /api/llm 으로 POST → 이 함수가 서버측 GEMINI_API_KEY로
 * Gemini API에 전달 → 응답을 클라이언트에 반환.
 *
 * 환경변수 (Vercel Settings → Environment Variables):
 *   GEMINI_API_KEY (또는 VITE_GEMINI_API_KEY 둘 다 지원)
 *
 * 키는 서버에만 존재하며 클라이언트 번들에 포함되지 않습니다.
 */

export const config = {
  runtime: 'edge',
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // 키는 process.env로 접근 (Vercel Edge runtime 지원)
  const apiKey =
    (typeof process !== 'undefined' && (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)) ||
    ''

  if (!apiKey) {
    return jsonResponse(
      {
        error:
          'GEMINI_API_KEY가 서버에 설정되지 않았습니다. Vercel Settings → Environment Variables 에 추가하세요.',
      },
      500,
    )
  }

  let body: LLMRequestBody
  try {
    body = (await req.json()) as LLMRequestBody
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`

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
  } catch (e) {
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
