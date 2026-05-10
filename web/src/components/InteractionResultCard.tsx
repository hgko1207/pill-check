import { useEffect, useState } from 'react'
import type { InteractionResult, UnifiedSearchResult } from '../lib/types'
import type { RegisteredMedication } from '../lib/db'
import {
  generateExplanation,
  getRemainingQuota,
  LLM_DAILY_LIMIT,
} from '../lib/llm'
import { buildLLMPrompt } from '../lib/promptBuilder'
import { friendlyError } from '../lib/errors'

const LEVEL_LABEL: Record<
  InteractionResult['level'],
  { icon: string; cardClass: string; titleClass: string }
> = {
  danger: { icon: '🔴', cardClass: 'result-card--danger', titleClass: 'result-card__title--danger' },
  warn: { icon: '🟡', cardClass: 'result-card--warn', titleClass: 'result-card__title--warn' },
  safe: { icon: '🟢', cardClass: 'result-card--safe', titleClass: 'result-card__title--safe' },
  unknown: { icon: '⚪', cardClass: 'result-card--unknown', titleClass: 'result-card__title--unknown' },
}

interface Props {
  result: InteractionResult
  product?: UnifiedSearchResult
  registered?: RegisteredMedication[]
}

export function InteractionResultCard({ result, product, registered }: Props) {
  const meta = LEVEL_LABEL[result.level]
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number>(LLM_DAILY_LIMIT)

  // 결과/제품 바뀌면 AI 응답 초기화
  useEffect(() => {
    setAiText(null)
    setAiError(null)
    setRemaining(getRemainingQuota())
  }, [product?.kind, product?.id, result.title])

  const canUseAi = !!product && !!registered && registered.length > 0
  // 회색(데이터 부족) 또는 노랑(주의) 결과에서 AI 해설 의미 큼
  // 빨강(명확한 위험)은 이미 정확한 정보, AI 추가는 선택
  const showAiButton = canUseAi && (result.level === 'unknown' || result.level === 'warn' || result.level === 'danger')

  async function handleAiExplain() {
    if (!product || !registered) return
    setAiLoading(true)
    setAiError(null)
    try {
      const prompt = buildLLMPrompt(product, registered)
      const text = await generateExplanation(prompt)
      setAiText(text)
      setRemaining(getRemainingQuota())
    } catch (e) {
      setAiError(friendlyError(e))
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <section
      className={`result-card ${meta.cardClass}`}
      role="status"
      aria-live="polite"
    >
      <h3 className={`result-card__title ${meta.titleClass}`}>
        {meta.icon} {result.title}
      </h3>
      <p className="result-card__message">{result.message}</p>

      {result.details && result.details.length > 0 && (
        <ul className="conflict-list">
          {result.details.map((d, i) => (
            <li key={i}>
              <b>{d.registeredMedName}</b> ↔ <b>{d.conflictWith}</b>
              <div style={{ fontSize: 14, color: 'var(--pc-text-muted)', marginTop: 4 }}>
                {d.source}
                {d.prohbtContent ? ` · ${d.prohbtContent.slice(0, 120)}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showAiButton && !aiText && (
        <div className="ai-actions">
          <button
            type="button"
            className="btn-small btn-small--ai"
            onClick={() => void handleAiExplain()}
            disabled={aiLoading || remaining === 0}
          >
            {aiLoading ? (
              <>
                <span className="spinner" /> AI 해설 받는 중…
              </>
            ) : remaining === 0 ? (
              `오늘 AI 한도 다 쓰셨어요 (내일 다시)`
            ) : (
              `🤖 AI 해설 받기 (오늘 ${remaining}/${LLM_DAILY_LIMIT}회 남음)`
            )}
          </button>
          <p className="ai-actions__hint">
            식약처 데이터로 부족할 때 일반적인 약·영양제 정보를 AI가 풀어 설명합니다.
          </p>
        </div>
      )}

      {aiError && (
        <div className="banner banner--error" style={{ marginTop: 10 }}>
          {aiError}
        </div>
      )}

      {aiText && (
        <div className="ai-explanation">
          <div className="ai-explanation__header">
            <span className="ai-badge">🤖 AI 해설 (참고용)</span>
            <span className="ai-quota-info">
              남은 횟수 {remaining}/{LLM_DAILY_LIMIT}
            </span>
          </div>
          <p className="ai-explanation__text">{aiText}</p>
          <p className="ai-explanation__footer">
            ⚠️ AI가 일반 정보로 생성한 답변입니다. <b>약사·의사 확인 필수.</b>
          </p>
        </div>
      )}
    </section>
  )
}
