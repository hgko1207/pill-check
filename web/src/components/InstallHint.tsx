import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pillcheck.installHintDismissed'

type Platform = 'ios' | 'android' | 'standalone' | 'other'

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other'
  // 이미 PWA 설치되어 standalone으로 실행 중
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  if (isStandalone) return 'standalone'

  const ua = window.navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'other'
}

export function InstallHint() {
  const [platform, setPlatform] = useState<Platform>('other')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
    setDismissed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  if (dismissed) return null
  if (platform === 'standalone' || platform === 'other') return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  return (
    <section className="install-hint" role="note">
      <button
        className="install-hint__close"
        onClick={handleDismiss}
        aria-label="닫기"
      >
        ✕
      </button>
      <h3 className="install-hint__title">📱 홈 화면에 추가하면 더 편해요</h3>
      <p className="install-hint__body">
        {platform === 'ios' ? (
          <>
            Safari 하단의 <b>공유 버튼(↑)</b> → <b>"홈 화면에 추가"</b> →
            오른쪽 위 <b>"추가"</b>. 그러면 일반 앱처럼 아이콘으로 바로 열 수 있습니다.
          </>
        ) : (
          <>
            크롬 우측 상단 <b>⋮ 메뉴</b> → <b>"앱 설치"</b> 또는{' '}
            <b>"홈 화면에 추가"</b>. 일반 앱처럼 바로 열 수 있습니다.
          </>
        )}
      </p>
    </section>
  )
}
