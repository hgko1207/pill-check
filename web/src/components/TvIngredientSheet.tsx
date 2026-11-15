import { useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { INGREDIENTS } from '../lib/ingredient-alias'
import { useBackClose } from '../lib/back-close'

interface Props {
  onClose: () => void
  onPick: (label: string) => void
}

/** TV에서 들은 성분 찾기: 화면 전체를 덮는 화면. 성분 칩이 많아 홈 안에서 펼치면 아래 내용이 화면 밖으로 밀린다 */
export function TvIngredientSheet({ onClose, onPick }: Props) {
  useBackClose(true, onClose)
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

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="tv-title">
      <div className="sheet__body">
        <div className="topbar">
          <button type="button" className="topbar__back" onClick={onClose} aria-label="뒤로">
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>
        <header className="detail-head">
          <h1 id="tv-title" className="detail-head__title">
            TV에서 들은 성분&nbsp;찾기
          </h1>
          <p className="detail-head__sub">어떤 성분을 들으셨어요? 누르면 그 성분이 든 제품을 찾아&nbsp;드려요.</p>
        </header>
        <div className="group tv-sheet__chips">
          <div className="chip-row">
            {INGREDIENTS.map((ing) => (
              <button key={ing.key} type="button" className="chip" onClick={() => onPick(ing.label)}>
                {ing.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
