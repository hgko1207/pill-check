import { useState } from 'react'
import {
  INGREDIENTS,
  matchIngredient,
  type IngredientMatch,
  type RawFields,
} from '../lib/ingredient-alias'

interface Props {
  item: RawFields
}

/** 영양제 상세의 "TV에서 들은 성분 확인": 식약처 신고 원료명 글자 대조 결과를 보여 준다 */
export function IngredientCheck({ item }: Props) {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<{ query: string; match: IngredientMatch } | null>(null)

  function check(query: string) {
    const q = query.trim()
    if (!q) return
    setChecked({ query: q, match: matchIngredient(item, q) })
  }

  return (
    <div className="ingr-check">
      <div className="ingr-check__chips">
        {INGREDIENTS.map((ing) => (
          <button
            key={ing.key}
            type="button"
            className="chip"
            aria-pressed={checked?.query === ing.label}
            onClick={() => check(ing.label)}
          >
            {ing.label}
          </button>
        ))}
      </div>
      <form
        className="ingr-check__form"
        onSubmit={(e) => {
          e.preventDefault()
          check(text)
        }}
      >
        <input
          className="input ingr-check__input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="직접 입력 (예: 루테인)"
          aria-label="확인할 성분 이름"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" className="btn ingr-check__submit">
          확인
        </button>
      </form>

      {checked && <IngredientResult query={checked.query} match={checked.match} />}
    </div>
  )
}

function IngredientResult({ query, match }: { query: string; match: IngredientMatch }) {
  const asked = match.result === 'unknown' && !match.label ? query : match.label

  let cardClass = 'result-card--unknown'
  let titleClass = 'result-card__title--unknown'
  let title = '확인 못 했어요'
  let body: React.ReactNode

  if (match.result === 'yes') {
    cardClass = 'result-card--safe'
    titleClass = 'result-card__title--safe'
    title = '✅ 들어 있어요'
    body = (
      <>
        <p className="result-card__message">
          원료: <b>{match.matched}</b>
          {match.note && ` (${match.note})`}
        </p>
        {match.etcOnly && (
          <p className="result-card__message">기능성 원료가 아닌 기타 원료로 신고됐어요.</p>
        )}
      </>
    )
  } else if (match.result === 'no') {
    title = '❌ 이 제품 원료에는 없어요'
    body = (
      <p className="result-card__message">
        {match.mainRaw.length > 0 ? (
          <>
            대신 들어 있는 주요 원료: <b>{match.mainRaw.join(', ')}</b>
          </>
        ) : (
          '신고된 원료 목록에서 찾지 못했어요.'
        )}
      </p>
    )
  } else if (match.reason === 'no-raw') {
    body = (
      <p className="result-card__message">
        이 제품은 원료 정보가 비어 있어요. 약사에게 확인해 보세요.
      </p>
    )
  } else {
    body = (
      <p className="result-card__message">
        아직 이 앱이 확인할 수 있는 성분이 아니에요. 아래 '원료' 칸을 보시거나 약사에게 물어보세요.
      </p>
    )
  }

  return (
    <div className={`result-card ${cardClass} ingr-check__result`} role="status">
      <p className="ingr-check__asked">확인한 성분: {asked}</p>
      <h4 className={`result-card__title ${titleClass}`}>{title}</h4>
      {body}
      <p className="ingr-check__note">식약처 신고 원료 기준이에요. 효과를 보장하지 않아요.</p>
    </div>
  )
}
