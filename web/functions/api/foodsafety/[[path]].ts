/**
 * Cloudflare Pages Function — 식품안전나라 호출 중계
 *
 * /api/foodsafety/api/<서비스>/... → https://openapi.foodsafetykorea.go.kr/api/<서버 키>/<서비스>/...
 * 휴대폰 망에서 정부 서버에 직접 닿지 못하는 일이 있어(2026-11-14 확인) 배포본은 이 함수를 거친다.
 * 키(FOODSAFETY_API_KEY)는 Pages Secret에만 있고 클라이언트 번들에 없다.
 * dev에서는 같은 경로를 vite.config.ts 프록시가 받아 키를 끼운다.
 */

interface Env {
  FOODSAFETY_API_KEY?: string
}

interface PagesContext {
  request: Request
  env: Env
}

const PREFIX = '/api/foodsafety/api/'
const UPSTREAM = 'https://openapi.foodsafetykorea.go.kr/api/'
const ALLOWED_ORIGINS = ['https://pill.hgko.dev', 'https://pill-check.pages.dev']

// 정부 서버가 가끔 연결을 받지 않아 20초 뒤 522가 난다(2026-11-17 측정, 8~10번에 1번, 바로 다음 호출은 정상).
// 평소 응답은 3초 안이라 6초에 끊고 1번 다시 부른다. 같은 코드가 functions/api/nedrug에도 있다
const ATTEMPT_TIMEOUT_MS = 6_000
const RETRY_STATUS = [502, 503, 504, 522]

/** 응답 머리를 받으면 타이머를 풀어 본문 받기는 끊지 않는다. 두 번 다 실패하면 null */
async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!RETRY_STATUS.includes(res.status)) return res
      void res.body?.cancel()
    } catch {
      /* 시간 초과나 연결 실패 → 다시 */
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // 배포 미리보기 주소 (예: https://f1c8aac8.pill-check.pages.dev)
  return /^https:\/\/[a-z0-9-]+\.pill-check\.pages\.dev$/.test(origin)
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const origin = context.request.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) {
    return new Response('Forbidden', { status: 403 })
  }
  const key = context.env.FOODSAFETY_API_KEY ?? ''
  if (!key) {
    return new Response('FOODSAFETY_API_KEY가 서버에 설정되지 않았습니다', { status: 500 })
  }

  const url = new URL(context.request.url)
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response('Not found', { status: 404 })
  }
  // 남은 경로: <서비스>/json/<시작>/<끝>[/<조건>]
  const rest = url.pathname.slice(PREFIX.length)

  const upstream = await fetchWithRetry(`${UPSTREAM}${key}/${rest}${url.search}`)
  if (!upstream) {
    return new Response('Upstream timeout', { status: 504 })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  })
}
