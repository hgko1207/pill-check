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
      return { title: '', sections: [], rawFallback: cleanText(xml) }
    }

    const docEl = doc.querySelector('DOC')
    if (!docEl) return { title: '', sections: [], rawFallback: cleanText(xml) }

    const docTitle = docEl.getAttribute('title') ?? ''
    const sections: DocSection[] = []

    docEl.querySelectorAll('SECTION').forEach((sectionEl) => {
      const sectionTitle = sectionEl.getAttribute('title') ?? ''
      const articles: DocArticle[] = []

      sectionEl.querySelectorAll('ARTICLE').forEach((articleEl) => {
        const articleTitle = articleEl.getAttribute('title') ?? ''
        const paragraphs: string[] = []
        articleEl.querySelectorAll('PARAGRAPH').forEach((p) => {
          const txt = cleanText(p.textContent ?? '')
          if (txt) paragraphs.push(txt)
        })
        // PARAGRAPH가 없으면 ARTICLE 자체 textContent 사용
        if (paragraphs.length === 0) {
          const txt = cleanText(articleEl.textContent ?? '')
          if (txt) paragraphs.push(txt)
        }
        articles.push({ title: articleTitle, paragraphs })
      })

      sections.push({ title: sectionTitle, articles })
    })

    return { title: docTitle, sections }
  } catch {
    return { title: '', sections: [], rawFallback: cleanText(xml) }
  }
}

function cleanText(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
