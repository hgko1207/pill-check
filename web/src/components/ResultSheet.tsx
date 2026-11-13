import { useEffect, useState } from 'react'
import { Check, ChevronLeft, CircleHelp, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { InteractionResult, UnifiedSearchResult } from '../lib/types'
import type { RegisteredMedication } from '../lib/db'
import { generateExplanation, getRemainingQuota, LLM_DAILY_LIMIT } from '../lib/llm'
import { buildLLMPrompt } from '../lib/promptBuilder'
import { friendlyError } from '../lib/errors'

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
}

/** 충돌 결과 화면: 화면 전체를 덮고, 결론 한 문장 → 내 약별 상태 → 다음 행동 */
export function ResultSheet({ result, product, registered, onClose, onCheckAnother }: Props) {
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

  // 내 약별 가장 높은 단계. 확인한 제품 자신은 비교하지 않았으므로 'self'
  const isSelf = (med: RegisteredMedication) => med.kind === product.kind && med.itemSeq === product.id
  const worstOf = (med: RegisteredMedication): 'danger' | 'warn' | null => {
    const hits = details.filter((d) => d.registeredMedName === med.itemName)
    if (hits.some((d) => d.severity === 'danger')) return 'danger'
    return hits.length > 0 ? 'warn' : null
  }
  const RANK = { danger: 0, warn: 1, none: 2, self: 3 } as const
  const rows = registered
    .map((med) => ({ med, state: isSelf(med) ? ('self' as const) : (worstOf(med) ?? ('none' as const)) }))
    .sort((a, b) => RANK[a.state] - RANK[b.state])
  const compared = rows.filter((r) => r.state !== 'self').length
  // 결론 바로 아래에 어떤 내 약과 부딪히는지 (조사가 필요 없는 "라벨: 이름" 형태)
  const whoLevel = result.level === 'danger' ? 'danger' : result.level === 'warn' ? 'warn' : null
  const whoNames = whoLevel ? rows.filter((r) => r.state === whoLevel).map((r) => r.med.itemName) : []

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
              {whoLevel === 'danger' ? '함께 드시면 안 되는 내 약' : '주의가 필요한 내 약'}:{' '}
              <b>{whoNames.join(', ')}</b>
            </p>
          )}
          <p className="verdict__message">{result.message}</p>
          {result.level === 'unknown' && result.checked && (
            <p className="verdict__ask">드시기 전에 약사에게 이&nbsp;화면을 보여 주세요.</p>
          )}
          {details.length > 0 && (
            <p className="verdict__source">근거: 식약처 {uniqueSources(details)} 정보</p>
          )}
        </section>

        {result.checked && (
          <>
            <h2 className="group-label">내 약 {compared}개와 비교했어요</h2>
            <ul className="group">
              {rows.map(({ med, state }) => {
                const hits = state === 'self' ? [] : details.filter((d) => d.registeredMedName === med.itemName)
                return (
                  <li key={med.id ?? med.itemSeq}>
                    <div className="row compare-row">
                      <div className="row__body">
                        <div className="row__title">{med.itemName}</div>
                        {state === 'self' && (
                          <p className="compare-row__why">이미 내 약에 있는 제품이에요. 이 약과는 비교하지&nbsp;않아요.</p>
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
                      {state === 'none' && <span className="status status--unknown">충돌 못&nbsp;찾음</span>}
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
          {showAi && !aiText && (
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
          <button type="button" className="btn btn--primary" onClick={onCheckAnother}>
            다른 제품 확인
          </button>
        </div>
      </div>
    </div>
  )
}

function uniqueSources(details: { source: string }[]): string {
  return [...new Set(details.map((d) => d.source))].join(', ')
}
