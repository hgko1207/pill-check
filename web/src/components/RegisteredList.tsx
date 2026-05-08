import { useEffect, useState } from 'react'
import {
  listMedications,
  removeMedication,
  MAX_MEDICATIONS,
  type RegisteredMedication,
} from '../lib/db'

interface Props {
  /** 외부에서 갱신 트리거(약 추가/삭제 후 부모가 +1하면 다시 로드) */
  refreshSignal?: number
  onChange?: () => void
}

export function RegisteredList({ refreshSignal, onChange }: Props) {
  const [meds, setMeds] = useState<RegisteredMedication[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listMedications()
      .then((list) => {
        if (!cancelled) setMeds(list)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshSignal])

  async function handleRemove(id: number, name: string) {
    if (!confirm(`"${name}" 을(를) 삭제하시겠습니까?`)) return
    await removeMedication(id)
    const next = await listMedications()
    setMeds(next)
    onChange?.()
  }

  return (
    <section className="card">
      <h2 className="card__title">
        부모님 복용 약 ({meds.length}/{MAX_MEDICATIONS})
      </h2>
      {loading && <p className="card__meta">불러오는 중…</p>}
      {!loading && meds.length === 0 && (
        <p className="card__meta">
          아직 등록된 약이 없습니다. 아래에서 약을 검색하고{' '}
          <b>"이 약 등록"</b> 버튼으로 추가하세요.
        </p>
      )}
      {!loading && meds.length > 0 && (
        <ul className="med-list">
          {meds.map((m) => (
            <li key={m.id} className="med-list__item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="med-list__name">{m.itemName}</div>
                {m.mainIngredient && (
                  <div className="med-list__ingr">
                    {m.mainIngredient.length > 80
                      ? m.mainIngredient.slice(0, 80) + '…'
                      : m.mainIngredient}
                  </div>
                )}
              </div>
              <button
                className="btn-small btn-small--danger"
                onClick={() => m.id != null && handleRemove(m.id, m.itemName)}
                aria-label={`${m.itemName} 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
