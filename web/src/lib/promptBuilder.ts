import type { RegisteredMedication } from './db'
import type { UnifiedSearchResult } from './types'

/**
 * Gemini Flash용 보수적 프롬프트.
 * - 60대 이해 가능한 단순 한국어
 * - 의료 단정 금지, 앱과 같은 해요체("~할 수 있어요")
 * - 데이터 부족 시 솔직히 인정 + 약사 상담 권유
 * - 4문장 이내 + 마지막에 약사나 의사 상담 안내 (화면에 그대로 나오므로 가운뎃점·기호를 쓰지 않게 한다)
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
1. "~할 수 있어요", "~로 알려져 있어요" 같은 부드러운 해요체로 쓰고 단정하지 마세요
2. 알려진 상호작용이 있으면 분명하게 알려 주세요 ("주의가 필요해요" 등)
3. 자료가 부족하거나 확실하지 않으면 "정확한 자료는 찾지 못했어요"라고 솔직하게 쓰세요
4. 진단하거나 처방하려 하지 마세요
5. 4문장 이내, 쉬운 말로 쓰세요. 가운뎃점(·), 별표, 글머리 기호 같은 기호는 쓰지 마세요
6. 마지막 줄에 반드시 "드시기 전에 약사나 의사와 상담해 주세요."를 쓰세요

답변:`
}

function cleanIngrCode(text: string): string {
  return text.replace(/\[[A-Z0-9]+\]/g, '').trim()
}
