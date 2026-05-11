import { useEffect, useState } from 'react'
import type { ToastType } from '../lib/dialog'

const DEFAULT_DURATION = 3200

interface Props {
  message: string
  type: ToastType
  duration?: number
  onDismiss: () => void
}

const ICONS: Record<ToastType, string> = {
  success: '✅',
  info: 'ℹ️',
  error: '⚠️',
}

export function Toast({ message, type, duration = DEFAULT_DURATION, onDismiss }: Props) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), duration - 250)
    const t2 = window.setTimeout(onDismiss, duration)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [duration, onDismiss])

  return (
    <div
      className={`toast toast--${type} ${leaving ? 'toast--leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast__icon" aria-hidden="true">
        {ICONS[type]}
      </span>
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={onDismiss}
        aria-label="알림 닫기"
      >
        ✕
      </button>
    </div>
  )
}
