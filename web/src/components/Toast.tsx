import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import type { ToastType } from '../lib/dialog'

const DEFAULT_DURATION = 3200

interface Props {
  message: string
  type: ToastType
  duration?: number
  onDismiss: () => void
}

const ICONS = { success: CircleCheck, info: Info, error: CircleAlert } as const

export function Toast({ message, type, duration = DEFAULT_DURATION, onDismiss }: Props) {
  const [leaving, setLeaving] = useState(false)
  const Icon = ICONS[type]

  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), duration - 250)
    const t2 = window.setTimeout(onDismiss, duration)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [duration, onDismiss])

  return (
    <div className={`toast toast--${type} ${leaving ? 'toast--leaving' : ''}`} role="status" aria-live="polite">
      <Icon className="toast__icon" aria-hidden="true" />
      <span className="toast__message">{message}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="알림 닫기">
        <X aria-hidden="true" />
      </button>
    </div>
  )
}
