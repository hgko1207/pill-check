import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
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
  /** "확인" 탭으로 이동해 약을 검색 */
  onAdd?: () => void
}

export function RegisteredList({ refreshSignal, onChange, onAdd }: Props) {
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

  async function handleRemove(id: number, name: string, kind: 'drug' | 'healthfood') {
    const ok = await confirm({
      title: kind === 'drug' ? '이 약을 지울까요?' : '이 영양제를 지울까요?',
      message: (
        <>
          <b>{name}</b>
          <br />
          내 약 목록에서 빠져요. 더 이상 드시지 않을 때만 지워&nbsp;주세요.
        </>
      ),
      confirmLabel: '지우기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    await removeMedication(id)
    setMeds(await listMedications())
    toast(`${name} 지웠어요.`, 'success')
    onChange?.()
  }

  if (loading) {
    return (
      <p className="loading-line">
        <span className="spinner" aria-hidden="true" /> 불러오는 중
      </p>
    )
  }

  if (meds.length === 0) {
    return (
      <>
        <div className="group empty-box">
          <p className="empty-box__title">아직 등록한 약이 없어요</p>
          <ol className="steps">
            <li>
              <b>확인</b> 탭에서 드시는 약 이름을 검색해요.
              <span className="steps__eg">예: 와파린, 종합비타민, 오메가3</span>
            </li>
            <li>
              검색 결과에서 <b>내 약에 등록</b>을 눌러요.
            </li>
            <li>
              새 제품을 살 때 <b>약 궁합 보기</b>을 누르면 함께 먹어도 되는지 알려&nbsp;드려요.
            </li>
          </ol>
        </div>
        <div className="block-actions">
          <button type="button" className="btn btn--primary" onClick={onAdd}>
            <Plus aria-hidden="true" /> 약 검색해서 등록하기
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="group-label">
        등록한 약 <span className="num">{meds.length}</span>/{MAX_MEDICATIONS}
      </h2>
      <ul className="group">
        {meds.map((m) => (
          <li key={m.id}>
            <div className="row">
              <div className="row__body">
                <div className="row__title">{m.itemName}</div>
                <div className="row__sub">{m.kind === 'healthfood' ? '영양제' : '의약품'}</div>
                {m.manufacturer && <div className="row__sub">{m.manufacturer}</div>}
              </div>
              <button
                type="button"
                className="text-btn text-btn--danger"
                onClick={() => m.id != null && handleRemove(m.id, m.itemName, m.kind)}
                aria-label={`${m.itemName} 지우기`}
              >
                지우기
              </button>
            </div>
          </li>
        ))}
      </ul>
      {meds.length < MAX_MEDICATIONS ? (
        <div className="block-actions">
          <button type="button" className="btn btn--secondary" onClick={onAdd}>
            <Plus aria-hidden="true" /> 약 추가하기
          </button>
        </div>
      ) : (
        <p className="group-note">
          최대 {MAX_MEDICATIONS}개까지 등록할 수 있어요. 더 드시지 않는 약을 지우면 새로 추가할 수&nbsp;있어요.
        </p>
      )}
    </>
  )
}
