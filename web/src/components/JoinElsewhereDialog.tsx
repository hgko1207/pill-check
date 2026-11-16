import { useEffect, useRef } from 'react'
import { Copy } from 'lucide-react'
import { useBackClose } from '../lib/back-close'
import { useDialog } from '../lib/dialog'
import { type InvitePreview } from '../lib/family'

interface Props {
  code: string
  info: InvitePreview
  /** "이 화면에서 연결": 지금 흐름(동의 창 → 연결) 그대로 */
  onJoinHere: () => void
  onClose: () => void
}

/**
 * 부모님 초대 링크가 홈 화면 앱이 아닌 곳(카톡 안 브라우저, 아이폰 Safari 등)에서 열렸을 때 (plan.md 54).
 * 그 브라우저의 저장 공간은 홈 화면 앱과 따로라, 여기서 연결하면 홈 화면 앱의 약이 가족에게 안 보인다.
 * 그래서 바로 연결하지 않고 코드를 보여 주며 앱에서 넣도록 안내한다. 코드는 쓰지 않는다.
 */
export function JoinElsewhereDialog({ code, info, onJoinHere, onClose }: Props) {
  const { toast } = useDialog()
  const copyRef = useRef<HTMLButtonElement>(null)
  const shownCode = `${code.slice(0, 4)} ${code.slice(4)}`

  useBackClose(true, onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    copyRef.current?.focus({ focusVisible: false } as FocusOptions)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast('코드를 복사했어요. 약똑똑 앱의 가족 연결 칸에 붙여 넣어 주세요.', 'success')
    } catch {
      toast('복사하지 못했어요. 화면의 코드를 보고 넣어 주세요.', 'error')
    }
  }

  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="join-elsewhere-title"
        aria-describedby="join-elsewhere-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="join-elsewhere-title" className="dialog__title">
          약똑똑 앱에서 코드를 넣어 주세요
        </h2>
        <div id="join-elsewhere-message" className="dialog__message">
          <b>{info.groupName}</b>에 &lsquo;{info.displayName}&rsquo; 이름으로 연결하는 초대예요. 휴대폰 홈 화면의
          약똑똑을 열고 <b>설정 → 가족 연결</b>에 이 코드를 넣어&nbsp;주세요.
        </div>
        <p className="family-code" aria-label={`초대 코드 ${code.split('').join(' ')}`}>
          {shownCode}
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--plain" onClick={onClose}>
            닫기
          </button>
          <button type="button" ref={copyRef} className="btn btn--primary" onClick={() => void copy()}>
            <Copy aria-hidden="true" /> 코드 복사
          </button>
        </div>
        <div className="join-elsewhere__here">
          <span>홈 화면에 약똑똑이 없나요?</span>
          <button type="button" className="text-btn" onClick={onJoinHere}>
            이 화면에서 연결
          </button>
        </div>
      </div>
    </div>
  )
}
