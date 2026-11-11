// 2단계 가능성 시험 공용 코드. 의존성 없이 Node 내장 fetch만 쓴다.
// 키는 web/.env에서 읽고, 로그에는 절대 찍지 않는다 (식품안전나라 키는 URL 경로에 들어간다).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')

export function loadEnvKey(name) {
  const text = readFileSync(join(ROOT, 'web', '.env'), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, '')
  }
  return ''
}

const KEY = loadEnvKey('VITE_FOODSAFETY_API_KEY')

export function hasKey() {
  return KEY.length > 0
}

function redact(s) {
  return KEY ? String(s).split(KEY).join('***') : String(s)
}

// 식품안전나라: /api/{KEY}/{SERVICE}/json/{START}/{END}/{FILTER}
export async function foodsafety(service, start, end, filter = '') {
  const url = `https://openapi.foodsafetykorea.go.kr/api/${KEY}/${service}/json/${start}/${end}${filter ? '/' + filter : ''}`
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error(redact(`fetch 실패: ${e.message}`))
  }
  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error(redact(`비-JSON 응답 (${res.status}): ${text.slice(0, 200)}`))
  }
  const data = JSON.parse(text)
  const body = data[service]
  if (!body) throw new Error(redact(`서비스 키 없음. 응답: ${text.slice(0, 300)}`))
  return {
    total: Number(body.total_count ?? 0),
    rows: body.row ?? [],
    code: body.RESULT?.CODE,
    msg: body.RESULT?.MSG,
  }
}
