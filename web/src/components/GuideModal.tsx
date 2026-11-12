import { useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

/** 사용법: 화면 전체를 덮는 화면 */
export function GuideModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="sheet__body">
        <div className="topbar">
          <button type="button" className="topbar__back" onClick={onClose} aria-label="뒤로">
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>
        <header className="detail-head">
          <h1 id="guide-title" className="detail-head__title">
            약똑똑 사용법
          </h1>
          <p className="detail-head__sub">드시는 약과 새로 산 영양제나 일반약을 함께 먹어도 되는지 알려&nbsp;드려요.</p>
        </header>

        <h2 className="group-label">처음 한 번</h2>
        <div className="group detail-box">
          <ol className="steps">
            <li>
              <b>확인</b> 탭에서 드시는 약 이름을 검색해요.
              <span className="steps__eg">예: 와파린, 노바스크, 종합비타민, 오메가3</span>
            </li>
            <li>
              검색 결과에서 <b>내 약에 등록</b>을 눌러요.
            </li>
          </ol>
        </div>

        <h2 className="group-label">새 제품을 살 때</h2>
        <div className="group detail-box">
          <ol className="steps">
            <li>
              제품 이름을 검색하거나 <b>바코드로 찾기</b>를 눌러요.
              <span className="steps__eg">예: 비타민D, 칼슘제</span>
            </li>
            <li>
              <b>내 약과 확인</b>을 누르면 결과가 색으로 나와요.
            </li>
          </ol>
          <ul className="legend">
            <li><span className="status status--danger">빨강</span> 함께 드시면 안 돼요</li>
            <li><span className="status status--warn">노랑</span> 함께 드실 때 주의가 필요해요</li>
            <li><span className="status status--unknown">회색</span> 확인된 충돌이 없거나 정보가 부족해요</li>
          </ul>
        </div>

        <h2 className="group-label">더 드시지 않는 약</h2>
        <div className="group detail-box">
          <p className="detail-text">
            <b>내 약</b> 탭에서 그 약 오른쪽의 <b>지우기</b>를 눌러요.
          </p>
        </div>

        <p className="fineprint">
          식품의약품안전처 공개 자료로 만든 참고용 정보예요. 진료가 아니며 약사나 의사 상담을
          대신하지&nbsp;않아요.
        </p>
      </div>
    </div>
  )
}
