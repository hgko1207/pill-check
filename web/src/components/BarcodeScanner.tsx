import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface Props {
  onScan: (text: string) => void
  onError?: (msg: string) => void
}

const ELEMENT_ID = 'pillcheck-barcode-reader'

export function BarcodeScanner({ onScan, onError }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onScanRef.current = onScan
    onErrorRef.current = onError
  }, [onScan, onError])

  useEffect(() => {
    let active = true
    const scanner = new Html5Qrcode(ELEMENT_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 160 } },
        (decodedText) => {
          if (active) onScanRef.current(decodedText)
        },
        () => {
          // 매 프레임 인식 실패 콜백 — 무시
        },
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        onErrorRef.current?.(msg)
      })

    return () => {
      active = false
      scanner.stop().catch(() => undefined).finally(() => {
        try { scanner.clear() } catch { /* noop */ }
      })
    }
  }, [])

  return <div id={ELEMENT_ID} style={{ width: '100%', maxWidth: 480, margin: '0 auto' }} />
}
