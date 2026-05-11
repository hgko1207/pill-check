/**
 * 전역 Dialog 시스템 — useDialog() 훅으로 어디서나 confirm/toast 호출.
 *
 * - confirm(opts): Promise<boolean> — 확인/취소 다이얼로그 (자체 UI)
 * - toast(msg, type): void — 상단 슬라이드 알림
 *
 * 브라우저 네이티브 confirm()/alert() 대체 — PWA·다크모드·warm 톤 일관성.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'

export type ToastType = 'success' | 'info' | 'error'

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
}

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  toast: (message: string, type?: ToastType) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useDialog must be used inside <DialogProvider>')
  }
  return ctx
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

interface ToastState {
  id: number
  message: string
  type: ToastType
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [toastState, setToastState] = useState<ToastState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve })
    })
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToastState({ id: Date.now(), message, type })
  }, [])

  const handleConfirmClose = (ok: boolean) => {
    if (confirmState) confirmState.resolve(ok)
    setConfirmState(null)
  }

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          variant={confirmState.variant}
          onConfirm={() => handleConfirmClose(true)}
          onCancel={() => handleConfirmClose(false)}
        />
      )}
      {toastState && (
        <Toast
          key={toastState.id}
          message={toastState.message}
          type={toastState.type}
          onDismiss={() => setToastState(null)}
        />
      )}
    </DialogContext.Provider>
  )
}
