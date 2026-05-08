import type { InteractionResult } from '../lib/types'

const LEVEL_LABEL: Record<InteractionResult['level'], { icon: string; cardClass: string; titleClass: string }> = {
  danger: { icon: '🔴', cardClass: 'result-card--danger', titleClass: 'result-card__title--danger' },
  warn: { icon: '🟡', cardClass: 'result-card--warn', titleClass: 'result-card__title--warn' },
  safe: { icon: '🟢', cardClass: 'result-card--safe', titleClass: 'result-card__title--safe' },
  unknown: { icon: '⚪', cardClass: 'result-card--unknown', titleClass: 'result-card__title--unknown' },
}

export function InteractionResultCard({ result }: { result: InteractionResult }) {
  const meta = LEVEL_LABEL[result.level]
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
              <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>
                {d.source}
                {d.prohbtContent ? ` · ${d.prohbtContent.slice(0, 120)}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
