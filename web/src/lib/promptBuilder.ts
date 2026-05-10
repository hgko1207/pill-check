import type { RegisteredMedication } from './db'
import type { UnifiedSearchResult } from './types'

/**
 * Gemini Flash용 보수적 프롬프트.
 * - 60대 이해 가능한 단순 한국어
 * - 의료 단정 금지, "~할 수 있습니다" 어조
 * - 데이터 부족 시 솔직히 인정 + 약사 상담 권유
 * - 4문장 이내 + 마지막에 "약사·의사 상담 필수"
 */
export function buildLLMPrompt(
  product: UnifiedSearchResult,
  registered: RegisteredMedication[],
): string {
  const productLabel = product.kind === 'drug' ? '의약품' : '영양제(건강기능식품)'
  const ingredient = (product.ingredient || '(원료/성분 정보 없음)').slice(0, 300)

  const medList = registered
    .map((m, i) => {
      const ing = m.mainIngredient ? cleanIngrCode(m.mainIngredient).slice(0, 200) : '(미상)'
      return `${i + 1}. ${m.itemName} — 성분: ${ing}`
    })
    .join('\n')

  return `당신은 약사 보조 AI입니다. 60대 부모님이 이해할 수 있는 쉬운 한국어로 답하세요.

[부모님이 매일 드시는 약 (${registered.length}개)]
${medList}

[새로 사려는 ${productLabel}]
이름: ${product.name}
성분/원료: ${ingredient}

위 약과 새 제품을 함께 복용해도 되는지, 일반적으로 알려진 정보를 바탕으로 4문장 이내로 설명하세요.

규칙:
1. "~할 수 있습니다", "~로 알려져 있습니다" 같은 부드러운 어조 사용 (단정 금지)
2. 알려진 상호작용이 있으면 명확하게 안내 ("주의가 필요합니다" 등)
3. 데이터 부족·불확실하면 "정확한 데이터는 확인되지 않습니다" 솔직하게
4. 의학 자가 진단·처방 시도 금지
5. 답변은 4문장 이내, 단순한 표현
6. 마지막 줄에 반드시 "약사·의사 상담 필수" 한 줄 추가

답변:`
}

function cleanIngrCode(text: string): string {
  return text.replace(/\[[A-Z0-9]+\]/g, '').trim()
}
