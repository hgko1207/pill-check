/**
 * Cloudflare Pages Function — 식약처(data.go.kr) 호출 중계
 *
 * /api/nedrug/1471000/... → https://apis.data.go.kr/1471000/...?serviceKey=<서버 키>
 * 휴대폰 망에서 정부 서버에 직접 닿지 못하는 일이 있어(2026-11-14 확인) 배포본은 이 함수를 거친다.
 * 키(NEDRUG_API_KEY)는 Pages Secret에만 있고 클라이언트 번들에 없다.
 * dev에서는 같은 경로를 vite.config.ts 프록시가 받아 키를 붙인다.
 */

interface Env {
  NEDRUG_API_KEY?: string
}

interface PagesContext {
  request: Request
  env: Env
}

const PREFIX = '/api/nedrug/'
const UPSTREAM = 'https://apis.data.go.kr/'
const ALLOWED_ORIGINS = ['https://pill.hgko.dev', 'https://pill-check.pages.dev']

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
  const key = context.env.NEDRUG_API_KEY ?? ''
  if (!key) {
    return new Response('NEDRUG_API_KEY가 서버에 설정되지 않았습니다', { status: 500 })
  }

  const url = new URL(context.request.url)
  const rest = url.pathname.slice(PREFIX.length)
  // 식약처(1471000) 서비스만 넘긴다
  if (!rest.startsWith('1471000/')) {
    return new Response('Not found', { status: 404 })
  }
  // 키는 서버 값으로만 붙인다. 나머지 조회 문자열은 다시 인코딩하지 않고 그대로 넘긴다
  const query = url.search
    .slice(1)
    .split('&')
    .filter((p) => p && !p.startsWith('serviceKey='))
    .join('&')

  let upstream: Response
  try {
    upstream = await fetch(`${UPSTREAM}${rest}?serviceKey=${key}${query ? `&${query}` : ''}`)
  } catch {
    return new Response('Upstream unreachable', { status: 502 })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  })
}
