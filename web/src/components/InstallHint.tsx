import { Smartphone, X } from 'lucide-react'
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
    <section className="group install-hint" role="note" aria-labelledby="install-title">
      <span className="row__icon" aria-hidden="true">
        <Smartphone />
      </span>
      <div className="install-hint__body">
        <h2 id="install-title" className="install-hint__title">
          홈 화면에 추가하면 앱처럼 쓸 수 있어요
        </h2>
        <p className="install-hint__text">
          {platform === 'ios' ? (
            <>
              Safari 아래쪽 <b>공유 버튼</b> → <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>를 눌러&nbsp;주세요.
            </>
          ) : (
            <>
              크롬 오른쪽 위 <b>점 세 개 메뉴</b> → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러&nbsp;주세요.
            </>
          )}
        </p>
      </div>
      <button type="button" className="install-hint__close" onClick={handleDismiss} aria-label="안내 닫기">
        <X aria-hidden="true" />
      </button>
    </section>
  )
}
