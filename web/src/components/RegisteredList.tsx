import { useEffect, useState } from 'react'
import {
  listMedications,
  removeMedication,
  MAX_MEDICATIONS,
  type RegisteredMedication,
} from '../lib/db'
import { useDialog } from '../lib/dialog'

interface Props {
  refreshSignal?: number
  onChange?: () => void
}

export function RegisteredList({ refreshSignal, onChange }: Props) {
  const [meds, setMeds] = useState<RegisteredMedication[]>([])
  const [loading, setLoading] = useState(true)
  const { confirm, toast } = useDialog()

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
    const ok = await confirm({
      title: '약 삭제',
      message: (
        <>
          <b>{name}</b>
          <br />이 약을 삭제하시겠습니까?
        </>
      ),
      confirmLabel: '삭제',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    await removeMedication(id)
    const next = await listMedications()
    setMeds(next)
    toast(`"${name}" 을(를) 삭제했어요.`, 'success')
    onChange?.()
  }

  if (loading) {
    return (
      <section className="card">
        <p className="card__meta">불러오는 중…</p>
      </section>
    )
  }

  // 빈 상태 — 시작하기 히어로
  if (meds.length === 0) {
    return (
      <section className="hero">
        <h2 className="hero__title">👋 약똑똑 시작하기</h2>
        <p className="hero__lead">
          부모님이 드시는 약과 새 영양제·일반약의
          <br />
          충돌을 미리 확인해드립니다.
        </p>

        <ol className="hero__steps">
          <li>
            <b>STEP 1.</b> 부모님이 드시는 약 등록
            <div className="hero__hint">
              아래 <b>검색창</b>에 약 이름 입력 → 결과의 <b>"+ 이 약 등록"</b> 클릭
              <br />
              <span className="hero__example">예: 와파린, 노바스크, 리피토</span>
            </div>
          </li>
          <li>
            <b>STEP 2.</b> 새 영양제·약 충돌 검사
            <div className="hero__hint">
              사고 싶은 제품 검색 → <b>"⚠️ 충돌 검사"</b> 클릭
              <br />
              <span className="hero__example">예: 오메가3, 비타민D, 종합비타민</span>
            </div>
          </li>
          <li>
            <b>STEP 3.</b> 결과 확인
            <div className="hero__hint">
              🔴 위험 / 🟡 주의 / ⚪ 정보 부족 / 🟢 확인됨 — 색상별 안내
            </div>
          </li>
        </ol>

        <p className="hero__cta">아래 검색창에서 시작해보세요 👇</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2 className="card__title">
        부모님 복용 약 ({meds.length}/{MAX_MEDICATIONS})
      </h2>
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
    </section>
  )
}
