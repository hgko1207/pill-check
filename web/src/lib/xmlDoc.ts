/**
 * 식약처 의약품정보 응답의 EE_DOC_DATA / UD_DOC_DATA / NB_DOC_DATA 파싱.
 *
 * 응답 형식 (예):
 * <DOC title="효능효과" type="EE">
 *   <SECTION title="">
 *     <ARTICLE title="1. 정맥혈전증">
 *       <PARAGRAPH>...</PARAGRAPH>
 *     </ARTICLE>
 *   </SECTION>
 * </DOC>
 */

export interface DocArticle {
  title: string
  paragraphs: string[]
}

export interface DocSection {
  title: string
  articles: DocArticle[]
}

export interface ParsedDoc {
  title: string
  sections: DocSection[]
  /** 파싱 실패 시 원본 텍스트로 fallback */
  rawFallback?: string
}

export function parseDoc(xml: string | null | undefined): ParsedDoc | null {
  if (!xml || xml.trim().length === 0) return null

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')

    const parserError = doc.querySelector('parsererror')
    if (parserError) {
      return { title: '', sections: [], rawFallback: paragraphToReadable(xml) }
    }

    const docEl = doc.querySelector('DOC')
    if (!docEl) return { title: '', sections: [], rawFallback: paragraphToReadable(xml) }

    const docTitle = docEl.getAttribute('title') ?? ''
    const sections: DocSection[] = []

    docEl.querySelectorAll('SECTION').forEach((sectionEl) => {
      const sectionTitle = sectionEl.getAttribute('title') ?? ''
      const articles: DocArticle[] = []

      sectionEl.querySelectorAll('ARTICLE').forEach((articleEl) => {
        const articleTitle = articleEl.getAttribute('title') ?? ''
        const paragraphs: string[] = []
        articleEl.querySelectorAll('PARAGRAPH').forEach((p) => {
          // PARAGRAPH 안에 HTML 태그가 그대로 들어있는 경우(식약처 응답 패턴) 정화 + 줄바꿈 보존
          const txt = paragraphToReadable(p.textContent ?? '')
          if (txt) paragraphs.push(txt)
        })
        // PARAGRAPH가 없으면 ARTICLE 자체 textContent 사용
        if (paragraphs.length === 0) {
          const txt = paragraphToReadable(articleEl.textContent ?? '')
          if (txt) paragraphs.push(txt)
        }
        articles.push({ title: articleTitle, paragraphs })
      })

      sections.push({ title: sectionTitle, articles })
    })

    return { title: docTitle, sections }
  } catch {
    return { title: '', sections: [], rawFallback: paragraphToReadable(xml) }
  }
}

/**
 * 표 데이터를 분리한 결과 노드.
 * - text: 일반 텍스트 (줄바꿈 보존)
 * - table: 행/열 배열 (실제 React table로 렌더 권장)
 */
export type DocNode =
  | { type: 'text'; content: string }
  | { type: 'table'; rows: string[][] }

const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m)
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

/**
 * PARAGRAPH 안에 <table>이 있으면 노드 단위로 분리.
 * - 텍스트 노드: 줄바꿈 보존
 * - 테이블 노드: rows/cells 배열로 추출 (React table로 렌더)
 *
 * 표가 없으면 [{type:'text', content: paragraphToReadable(raw)}] 단일 노드.
 */
export function paragraphToNodes(raw: string | null | undefined): DocNode[] {
  if (!raw) return []
  if (!/<table[^>]*>/i.test(raw)) {
    const text = paragraphToReadable(raw)
    return text ? [{ type: 'text', content: text }] : []
  }

  const nodes: DocNode[] = []
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tableRegex.exec(raw)) !== null) {
    // 표 앞의 텍스트
    if (match.index > lastIndex) {
      const before = paragraphToReadable(raw.slice(lastIndex, match.index))
      if (before) nodes.push({ type: 'text', content: before })
    }
    // 표 자체 파싱
    const rows = parseTableRows(match[0])
    if (rows.length > 0) nodes.push({ type: 'table', rows })
    lastIndex = match.index + match[0].length
  }
  // 마지막 표 뒤의 텍스트
  if (lastIndex < raw.length) {
    const after = paragraphToReadable(raw.slice(lastIndex))
    if (after) nodes.push({ type: 'text', content: after })
  }

  return nodes
}

function parseTableRows(tableHtml: string): string[][] {
  const rows: string[][] = []
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const cells: string[] = []
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
      const cellHtml = cellMatch[1]
      // 셀 내부 HTML 정리: <p>, <br> 등 제거하고 텍스트만
      const cellText = decodeEntities(stripTags(cellHtml)).replace(/\s+/g, ' ').trim()
      cells.push(cellText)
    }
    if (cells.length > 0 && cells.some((c) => c.length > 0)) rows.push(cells)
  }
  return rows
}

/**
 * PARAGRAPH 안에 HTML이 내포된 경우(식약처 표 등) 가독 가능한 텍스트로 변환.
 * - <br>, </p>, </tr>, </li>, </h*>, </tbody>, </table> → 줄바꿈
 * - </td><td...> → " | " (셀 구분)
 * - 모든 HTML 태그 제거
 * - HTML entity 디코드
 * - 연속 공백 정리, 줄바꿈은 보존
 *
 * 결과는 white-space: pre-line으로 렌더링 시 줄바꿈 표시됨.
 */
export function paragraphToReadable(raw: string | null | undefined): string {
  if (!raw) return ''
  // HTML 태그 없으면 단순 정리만
  if (!/<[a-z][^>]*>/i.test(raw)) {
    return raw
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  let s = raw

  // 표 셀 구분자: </td><td> → " | "
  s = s.replace(/<\/td>\s*<td[^>]*>/gi, ' | ')

  // 표 시작·끝, 행 시작 → 줄바꿈
  s = s
    .replace(/<\/?(table|tbody|thead)[^>]*>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '')
    .replace(/<td[^>]*>/gi, '')

  // 단락·항목·헤딩 끝 → 줄바꿈
  s = s
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<(p|li|h[1-6]|div)[^>]*>/gi, '')

  // 남은 모든 HTML 태그 제거
  s = s.replace(/<[^>]+>/g, '')

  // HTML entity 디코드
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  // 줄별로 공백 정리, 빈 줄·과한 빈 줄 정리
  s = s
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')

  return s
}
