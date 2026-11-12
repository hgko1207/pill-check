import summary from '../data/ingredient-summary.json'
import { findIngredient } from '../lib/ingredient-alias'

interface IngredientSummary {
  label: string
  products: number
  functions: string[]
  cautions: string[]
}

const DATA = summary as {
  generatedAt: string
  ingredients: Record<string, IngredientSummary | undefined>
}

interface Props {
  /** 사용자가 검색한 말 */
  term: string
}

/** 검색어가 별칭표 성분이면 검색 결과 위에 성분 설명을 보여 준다. 제품 목록·순위는 넣지 않는다. */
export function IngredientCard({ term }: Props) {
  const ing = findIngredient(term)
  const info = ing ? DATA.ingredients[ing.key] : undefined
  if (!info) return null

  return (
    <section aria-labelledby="ingr-card-title">
      <h2 className="group-label">성분 설명</h2>
      <div className="group ingr-card">
        <h3 id="ingr-card-title" className="ingr-card__name">
          {info.label}
        </h3>

        {info.functions.length > 0 && (
          <>
            <h4 className="ingr-card__heading">식약처에 신고된 기능성</h4>
            <ul className="ingr-card__list">
              {info.functions.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </>
        )}

        {info.cautions.length > 0 && (
          <details className="disclosure">
            <summary className="disclosure__summary">섭취 시 주의사항 보기</summary>
            <ul className="ingr-card__list">
              {info.cautions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </details>
        )}

        <p className="ingr-card__count">
          이 성분을 기능성 원료로 신고한 제품{' '}
          <b className="num">{info.products.toLocaleString('ko-KR')}개</b>
          <span className="ingr-card__date"> ({DATA.generatedAt} 기준)</span>
        </p>
        <p className="ingr-card__note">
          신고한 제품들에 가장 많이 적힌 문구예요. 제품마다 함량과 문구가 다르니, 제품을 눌러
          확인해&nbsp;주세요.
        </p>
      </div>
    </section>
  )
}
