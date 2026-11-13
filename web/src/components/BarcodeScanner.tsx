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

    // 시작 결과를 기억해 둔다: 닫을 때 시작이 끝나기를 기다려야 한다. 실패해도 이 Promise는 거부되지 않는다
    const started = scanner
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
        if (active) onErrorRef.current?.(msg)
      })

    return () => {
      active = false
      // html5-qrcode의 stop()은 스캔 중이 아니면 Promise 거부가 아니라 그 자리에서 throw한다.
      // 카메라를 못 켰거나 켜지는 중에 닫으면 그 throw가 앱 전체를 내렸다 (2026-11-13 운영에서 재현).
      // 시작이 끝난 뒤, 스캔 중일 때만 멈춘다.
      void started.then(async () => {
        try {
          if (scanner.isScanning) await scanner.stop()
        } catch {
          /* 이미 멈춘 상태 */
        }
        try {
          scanner.clear()
        } catch {
          /* noop */
        }
      })
    }
  }, [])

  return <div id={ELEMENT_ID} style={{ width: '100%', maxWidth: 480, margin: '0 auto' }} />
}
