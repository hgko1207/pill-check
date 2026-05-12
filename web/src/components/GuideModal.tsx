import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

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
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <article className="modal-content">
          <section className="hero" style={{ boxShadow: 'none' }}>
            <h2 className="hero__title">📖 약똑똑 사용법</h2>
            <p className="hero__lead">
              부모님이 드시는 약과 새 영양제·일반약의
              <br />
              충돌을 미리 확인해드립니다.
            </p>
            <ol className="hero__steps">
              <li>
                <b>STEP 1.</b> 부모님이 드시는 <b>약·영양제 등록</b>
                <div className="hero__hint">
                  <b>🔍 검색</b> 탭에서 이름 입력 → 결과의 <b>"+ 등록"</b> 클릭
                  <br />
                  <span className="hero__example">
                    예: 와파린·노바스크·리피토(처방약), 종합비타민·오메가3·홍삼(영양제)
                  </span>
                </div>
              </li>
              <li>
                <b>STEP 2.</b> 새로 살 영양제·일반약 <b>충돌 검사</b>
                <div className="hero__hint">
                  사고 싶은 제품 검색 → <b>"⚠️ 충돌 검사"</b> 클릭
                  <br />
                  <span className="hero__example">예: 비타민D, 칼슘제, 새 일반의약품</span>
                </div>
              </li>
              <li>
                <b>STEP 3.</b> 결과 확인 (색상별)
                <div className="hero__hint">
                  🔴 위험 / 🟡 주의 / ⚪ 정보 부족 / 🟢 확인됨
                </div>
              </li>
              <li>
                <b>약·영양제 중단 시</b> — 개별 삭제
                <div className="hero__hint">
                  <b>🏠 홈</b> 탭 등록 목록 → 각 항목 우측 <b>"삭제"</b> 버튼
                  <br />
                  <span className="hero__example">
                    먹다가 중단하신 것만 골라 빼시면 됩니다.
                  </span>
                </div>
              </li>
            </ol>
          </section>
          <p className="modal-disclaimer">
            본 정보는 식품의약품안전처 공공데이터를 기반으로 한 참고 자료입니다.
            의료 행위가 아니며, 약사·의사 상담을 대체하지 않습니다.
          </p>
        </article>
      </div>
    </div>
  )
}
