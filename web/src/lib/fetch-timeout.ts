/**
 * 시간 제한이 있는 fetch. 정부 서버가 연결을 받지 않으면 끝없이 기다리지 않게 한다.
 * 배포본은 중계 함수가 6초씩 두 번 시도하고 504로 끝내므로(functions/api/nedrug), 이 값은 폰 망이 멈춘 경우의 안전장치다.
 * iOS 16 미만도 되게 AbortSignal.timeout은 쓰지 않는다. 시간이 지나면 AbortError(DOMException)로 실패한다.
 */
export const API_TIMEOUT_MS = 15_000

export async function fetchWithTimeout(url: string, ms = API_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function isTimeoutError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
