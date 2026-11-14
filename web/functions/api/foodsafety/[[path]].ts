/**
 * Cloudflare Pages Function — 식품안전나라 호출 중계
 *
 * /api/foodsafety/api/... → https://openapi.foodsafetykorea.go.kr/api/...
 * 휴대폰 망에서 정부 서버에 직접 닿지 못하는 일이 있어(2026-11-14 확인) 배포본은 이 함수를 거친다.
 * dev에서는 같은 경로를 vite.config.ts 프록시가 받는다.
 */

interface PagesContext {
  request: Request
}

const PREFIX = '/api/foodsafety/'
const UPSTREAM = 'https://openapi.foodsafetykorea.go.kr/'

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const url = new URL(context.request.url)
  const rest = url.pathname.slice(PREFIX.length)
  // 공개 API 경로(/api/...)만 넘긴다
  if (!rest.startsWith('api/')) {
    return new Response('Not found', { status: 404 })
  }

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM + rest + url.search)
  } catch {
    return new Response('Upstream unreachable', { status: 502 })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  })
}
