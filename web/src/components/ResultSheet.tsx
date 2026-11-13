import { useEffect, useState } from 'react'
import { Check, ChevronLeft, CircleHelp, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { InteractionResult, UnifiedSearchResult } from '../lib/types'
import type { RegisteredMedication } from '../lib/db'
import { generateExplanation, getRemainingQuota, LLM_DAILY_LIMIT } from '../lib/llm'
import { buildLLMPrompt } from '../lib/promptBuilder'
import { friendlyError } from '../lib/errors'
import { medKey } from '../lib/dur-match'

const VERDICT_ICON = {
  danger: X,
  warn: TriangleAlert,
  safe: Check,
  unknown: CircleHelp,
} as const

interface Props {
  result: InteractionResult
  product: UnifiedSearchResult
  registered: RegisteredMedication[]
  onClose: () => void
  /** 다른 제품 확인: 결과를 닫고 검색창으로 */
  onCheckAnother: () => void
  /** 자료를 못 받은 약이 있을 때 같은 제품을 다시 확인한다 */
  onRetry?: () => Promise<void>
}

/** 충돌 결과 화면: 화면 전체를 덮고, 결론 한 문장 → 내 약별 상태 → 다음 행동 */
export function ResultSheet({ result, product, registered, onClose, onCheckAnother, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false)
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiFromCache, setAiFromCache] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number>(LLM_DAILY_LIMIT)

  useEffect(() => {
    setAiText(null)
    setAiFromCache(false)
    setAiError(null)
    setRemaining(getRemainingQuota())
  }, [product.kind, product.id, result.title])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // 회색(정보 부족)·노랑·빨강에서 AI 해설이 의미 있다. 등록약이 있어야 비교 해설이 된다
  const showAi = registered.length > 0 && result.level !== 'safe'

  async function handleAiExplain() {
    setAiLoading(true)
    setAiError(null)
    try {
      const { text, fromCache } = await generateExplanation(buildLLMPrompt(product, registered))
      setAiText(text)
      setAiFromCache(fromCache)
      setRemaining(getRemainingQuota())
    } catch (e) {
      setAiError(friendlyError(e))
    } finally {
      setAiLoading(false)
    }
  }

  const Icon = VERDICT_ICON[result.level]
  const details = result.details ?? []

  // 내 약별 상태. 충돌이 있으면 그 단계, 없으면 대조 상태(coverage)를 따른다:
  // unchecked = 식약처 자료를 못 받음, na = 영양제끼리라 비교할 자료가 없음, self = 확인한 제품 자신
  // same = 같은 성분이 겹침, nosame = 재료 이름으로 찾아봤지만 겹침을 못 찾음 (영양제끼리)
  type RowState = 'danger' | 'warn' | 'same' | 'unchecked' | 'none' | 'nosame' | 'na' | 'self'
  const sharedOf = (med: RegisteredMedication) => result.overlap?.[medKey({ kind: med.kind, id: med.itemSeq })]
  const stateOf = (med: RegisteredMedication): RowState => {
    if (med.kind === product.kind && med.itemSeq === product.id) return 'self'
    const hits = details.filter((d) => d.registeredMedName === med.itemName)
    if (hits.some((d) => d.severity === 'danger')) return 'danger'
    if (hits.length > 0) return 'warn'
    const shared = sharedOf(med)
    if (shared && shared.length > 0) return 'same'
    const cov = result.coverage?.[medKey({ kind: med.kind, id: med.itemSeq })]
    if (cov === 'unchecked') return 'unchecked'
    if (shared) return 'nosame'
    return cov === 'na' ? 'na' : 'none'
  }
  const RANK: Record<RowState, number> = { danger: 0, warn: 1, same: 2, unchecked: 3, none: 4, nosame: 5, na: 6, self: 7 }
  const rows = registered
    .map((med) => ({ med, state: stateOf(med) }))
    .sort((a, b) => RANK[a.state] - RANK[b.state])
  const COMPARED: RowState[] = ['danger', 'warn', 'same', 'none', 'nosame']
  const compared = rows.filter((r) => COMPARED.includes(r.state)).length
  const hasSame = rows.some((r) => r.state === 'same')
  const uncheckedCount = rows.filter((r) => r.state === 'unchecked').length
  // 자료를 못 받은 약이 있으면 "다시 확인"이 주 버튼이다 (AI 해설은 대조가 끝난 결과에만)
  const canRetry = uncheckedCount > 0 && !!onRetry

  async function handleRetry() {
    if (!onRetry || retrying) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  // 결론 바로 아래에 어떤 내 약과 부딪히는지 (조사가 필요 없는 "라벨: 이름" 형태)
  // 노랑이 같은 성분 겹침만으로 나왔으면 라벨도 그 말로 바꾼다
  const whoLevel = result.level === 'danger' ? 'danger' : result.level === 'warn' ? 'warn' : null
  const sameOnly = whoLevel === 'warn' && details.length === 0
  const whoNames = whoLevel
    ? rows.filter((r) => r.state === (sameOnly ? 'same' : whoLevel)).map((r) => r.med.itemName)
    : []
  const whoLabel =
    whoLevel === 'danger' ? '함께 드시면 안 되는 내 약' : sameOnly ? '같은 성분이 든 내 약' : '주의가 필요한 내 약'

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="sheet__body sheet__body--with-actions">
        <div className="topbar">
          <button type="button" className="topbar__back" onClick={onClose} aria-label="뒤로">
            <ChevronLeft aria-hidden="true" />
          </button>
          <p className="topbar__title">{product.name}</p>
        </div>

        <section className={`verdict verdict--${result.level}`} role="status" aria-live="polite">
          <span className="verdict__icon" aria-hidden="true">
            <Icon />
          </span>
          <h1 id="result-title" className="verdict__title">
            {result.title}
          </h1>
          {whoNames.length > 0 && (
            <p className="verdict__who">
              {whoLabel}:{' '}
              <b>{whoNames.join(', ')}</b>
            </p>
          )}
          <p className="verdict__message">{result.message}</p>
          {result.level === 'unknown' && result.checked && (
            <p className="verdict__ask">드시기 전에 약사에게 이&nbsp;화면을 보여 주세요.</p>
          )}
          {details.length > 0 && (
            <p className="verdict__source">근거: 식약처 {uniqueSources(details)} 자료</p>
          )}
          {hasSame && <p className="verdict__source">같은 성분 근거: 식약처에 신고한 재료&nbsp;이름</p>}
        </section>

        {result.checked && (
          <>
            <h2 className="group-label">
              내 약 {compared}개와 비교했어요
              {uncheckedCount > 0 && `, ${uncheckedCount}개는 확인하지 못했어요`}
            </h2>
            <ul className="group">
              {rows.map(({ med, state }) => {
                const hits =
                  state === 'danger' || state === 'warn'
                    ? details.filter((d) => d.registeredMedName === med.itemName)
                    : []
                return (
                  <li key={med.id ?? med.itemSeq}>
                    <div className="row compare-row">
                      <div className="row__body">
                        <div className="row__title">{med.itemName}</div>
                        {state === 'self' && (
                          <p className="compare-row__why">이미 내 약에 있는 제품이에요. 이 약과는 비교하지&nbsp;않아요.</p>
                        )}
                        {state === 'unchecked' && (
                          <p className="compare-row__why">식약처 자료를 받지 못해서 비교하지&nbsp;못했어요.</p>
                        )}
                        {state === 'na' && (
                          <p className="compare-row__why">영양제끼리는 식약처 자료로 비교할 수&nbsp;없어요.</p>
                        )}
                        {state === 'same' && (
                          <p className="compare-row__why">
                            <b>{sharedOf(med)?.join(', ')}</b> 성분이 겹쳐요
                          </p>
                        )}
                        {state === 'nosame' && (
                          <p className="compare-row__why">재료 이름에서 같은 성분을 못&nbsp;찾았어요.</p>
                        )}
                        {hits.map((d, i) => (
                          <p key={i} className="compare-row__why">
                            <b>{d.conflictWith}</b> 성분이 문제가&nbsp;돼요
                            {d.prohbtContent && (
                              <>
                                <br />
                                {d.prohbtContent}
                              </>
                            )}
                          </p>
                        ))}
                      </div>
                      {state === 'danger' && <span className="status status--danger">함께 안&nbsp;돼요</span>}
                      {state === 'warn' && <span className="status status--warn">주의 필요</span>}
                      {state === 'same' && <span className="status status--warn">성분 겹침</span>}
                      {state === 'nosame' && <span className="status status--unknown">겹침 못&nbsp;찾음</span>}
                      {state === 'none' && <span className="status status--unknown">문제 못&nbsp;찾음</span>}
                      {state === 'unchecked' && <span className="status status--unknown">확인 못&nbsp;함</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {aiError && (
          <div className="notice notice--error" role="alert">
            <TriangleAlert aria-hidden="true" />
            <span>{aiError}</span>
          </div>
        )}

        {aiText && (
          <>
            <h2 className="group-label">AI 해설 (참고용)</h2>
            <div className="group ai-box">
              <p className="ai-box__text">{aiText}</p>
              <p className="ai-box__foot">
                AI가 일반 정보로 쓴 설명이에요. <b>꼭 약사나 의사에게 확인해&nbsp;주세요.</b>
                {aiFromCache && ' 저장해 둔 답변이에요.'} 오늘 남은 횟수 {remaining}/{LLM_DAILY_LIMIT}
              </p>
            </div>
          </>
        )}

        <p className="fineprint">
          식품의약품안전처 공개 자료로 만든 참고용 정보예요. 진료가 아니며 약사나 의사 상담을
          대신하지 않아요. 드실지는 꼭 약사나 의사와 상의해서 정해&nbsp;주세요.
        </p>
      </div>

      <div className="action-bar">
        <div className="action-bar__inner">
          {canRetry && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleRetry()}
              disabled={retrying}
            >
              {retrying ? (
                <>
                  <span className="spinner" aria-hidden="true" /> 다시 확인하는 중
                </>
              ) : (
                '다시 확인'
              )}
            </button>
          )}
          {showAi && !canRetry && !aiText && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void handleAiExplain()}
              disabled={aiLoading || remaining === 0}
            >
              {aiLoading ? (
                <>
                  <span className="spinner" aria-hidden="true" /> 해설 받는 중
                </>
              ) : remaining === 0 ? (
                '오늘 AI 해설을 다 쓰셨어요'
              ) : (
                <>
                  <Sparkles aria-hidden="true" /> AI 해설
                </>
              )}
            </button>
          )}
          <button
            type="button"
            className={canRetry ? 'btn btn--secondary' : 'btn btn--primary'}
            onClick={onCheckAnother}
          >
            다른 제품 확인
          </button>
        </div>
      </div>
    </div>
  )
}

// 식약처 자료 이름(TYPE_NAME)을 쉬운 말로. 모르는 이름은 그대로 보인다
const SOURCE_LABEL: Record<string, string> = {
  병용금기: '"함께 먹으면 안 되는 약"',
  병용주의: '"함께 먹을 때 주의할 약"',
}

function uniqueSources(details: { source: string }[]): string {
  return [...new Set(details.map((d) => SOURCE_LABEL[d.source] ?? d.source))].join(', ')
}
