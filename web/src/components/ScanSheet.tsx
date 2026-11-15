import { useEffect, useState } from 'react'
import { ChevronLeft, CircleAlert } from 'lucide-react'
import { BarcodeScanner } from './BarcodeScanner'
import { useBackClose } from '../lib/back-close'

interface Props {
  onClose: () => void
  onScan: (text: string) => void
}

/** 바코드로 찾기: 화면 전체를 덮는 화면. 홈 안에서 펼치면 아래 내용이 크게 밀려서 덮는 화면으로 띄운다 */
export function ScanSheet({ onClose, onScan }: Props) {
  const [cameraFailed, setCameraFailed] = useState(false)
  // 다시 켜기를 누를 때마다 바꿔 BarcodeScanner를 새로 붙인다
  const [attempt, setAttempt] = useState(0)
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
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="scan-title">
      <div className="sheet__body">
        <div className="topbar">
          <button type="button" className="topbar__back" onClick={onClose} aria-label="뒤로">
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>
        <header className="detail-head">
          <h1 id="scan-title" className="detail-head__title">
            바코드로 찾기
          </h1>
          <p className="detail-head__sub">제품 상자의 바코드를 화면 가운데에 비춰&nbsp;주세요.</p>
        </header>

        {cameraFailed ? (
          <>
            <div className="notice notice--error" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>카메라를 켜지 못했어요. 카메라 사용을 허용한 뒤 다시 켜기를 눌러&nbsp;주세요.</span>
            </div>
            <div className="scan-sheet__retry">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setCameraFailed(false)
                  setAttempt((n) => n + 1)
                }}
              >
                다시 켜기
              </button>
            </div>
          </>
        ) : (
          <div className="group scan-sheet__camera">
            <BarcodeScanner key={attempt} onScan={onScan} onError={() => setCameraFailed(true)} />
          </div>
        )}

        <p className="scan-sheet__note">영양제는 아직 바코드로 찾을 수 없어요. 제품 이름으로 찾아&nbsp;주세요.</p>
      </div>
    </div>
  )
}
