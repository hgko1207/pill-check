import { useState } from 'react'
import { CircleCheck, CircleHelp, CircleX } from 'lucide-react'
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
      <div className="chip-row">
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
        <label className="field field--flat">
          <span className="sr-only">확인할 성분 이름</span>
          <input
            className="field__input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="직접 입력 (예: 루테인)"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn btn--secondary btn--small" disabled={!text.trim()}>
          확인
        </button>
      </form>

      {checked && <IngredientResult query={checked.query} match={checked.match} />}
    </div>
  )
}

function IngredientResult({ query, match }: { query: string; match: IngredientMatch }) {
  const asked =
    match.result === 'text-yes' || match.result === 'text-no' ? match.asked : (match.label ?? query)

  if (match.result === 'yes') {
    return (
      <div className="ingr-result ingr-result--yes" role="status">
        <p className="ingr-result__title">
          <CircleCheck aria-hidden="true" /> 들어 있어요
        </p>
        <p className="ingr-result__asked">확인한 성분: {asked}</p>
        <p className="ingr-result__text">
          재료: <b>{match.matched}</b>
          {match.note && ` (${match.note})`}
        </p>
        {match.etcOnly && <p className="ingr-result__text">주된 재료가 아니라 그 밖의 재료로 신고됐어요.</p>}
        <Note />
      </div>
    )
  }

  if (match.result === 'no') {
    return (
      <div className="ingr-result ingr-result--no" role="status">
        <p className="ingr-result__title">
          <CircleX aria-hidden="true" /> 이 제품 재료에는 없어요
        </p>
        <p className="ingr-result__asked">확인한 성분: {asked}</p>
        <p className="ingr-result__text">
          {match.mainRaw.length > 0 ? (
            <>
              대신 들어 있는 주요 재료: <b>{match.mainRaw.join(', ')}</b>
            </>
          ) : (
            '신고한 재료 목록에서 못 찾았어요.'
          )}
        </p>
        <Note />
      </div>
    )
  }

  if (match.result === 'text-yes') {
    return (
      <div className="ingr-result ingr-result--yes" role="status">
        <p className="ingr-result__title">
          <CircleCheck aria-hidden="true" /> 재료 이름에 있어요
        </p>
        <p className="ingr-result__asked">확인한 말: {asked}</p>
        <p className="ingr-result__text">
          재료: <b>{match.matched}</b>
        </p>
        {match.etcOnly && <p className="ingr-result__text">주된 재료가 아니라 그 밖의 재료로 신고됐어요.</p>}
        <p className="ingr-result__text">재료 이름에 그 글자가 있는지만 본 결과예요.</p>
        <Note />
      </div>
    )
  }

  if (match.result === 'text-no') {
    return (
      <div className="ingr-result ingr-result--unknown" role="status">
        <p className="ingr-result__title">
          <CircleHelp aria-hidden="true" /> 재료 이름에서 못 찾았어요
        </p>
        <p className="ingr-result__asked">확인한 말: {asked}</p>
        <p className="ingr-result__text">다른 이름으로 신고됐을 수도 있어요.</p>
        {match.mainRaw.length > 0 && (
          <p className="ingr-result__text">
            주요 재료: <b>{match.mainRaw.join(', ')}</b>
          </p>
        )}
        <Note />
      </div>
    )
  }

  return (
    <div className="ingr-result ingr-result--unknown" role="status">
      <p className="ingr-result__title">
        <CircleHelp aria-hidden="true" /> 확인 못 했어요
      </p>
      <p className="ingr-result__asked">확인한 성분: {asked}</p>
      <p className="ingr-result__text">
        {match.reason === 'no-raw'
          ? '이 제품은 재료 정보가 비어 있어요. 약사에게 확인해 보세요.'
          : '성분 이름을 두 글자 이상 입력해 주세요.'}
      </p>
      <Note />
    </div>
  )
}

function Note() {
  return <p className="ingr-result__note">식약처에 신고한 재료 기준이에요. 효과를 보장하지 않아요.</p>
}
