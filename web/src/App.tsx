import { useEffect, useState } from 'react'
import { SearchScreen } from './components/SearchScreen'
import { RegisteredList } from './components/RegisteredList'
import { InstallHint } from './components/InstallHint'
import { BottomNav, type ViewKey } from './components/BottomNav'
import { SettingsPage } from './components/SettingsPage'
import { DetailModal, type DetailTarget } from './components/DetailModal'
import { GuideModal } from './components/GuideModal'
import { initTheme } from './lib/theme'

export default function App() {
  const [view, setView] = useState<ViewKey>('home')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    initTheme()
    // 저장된 글자 크기 적용
    const savedFont = localStorage.getItem('pillcheck.fontScale')
    if (savedFont === 'large') {
      document.documentElement.setAttribute('data-font-scale', 'large')
    }
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <span className="app__title-emoji" aria-hidden="true">💊</span>
          약똑똑
        </h1>
        <p className="app__subtitle">
          약과 영양제, <b>함께 먹어도 괜찮을까요?</b>
        </p>
      </header>

      <main className="app__main">
        {view === 'home' && (
          <section className="page">
            <InstallHint />
            <RegisteredList
              refreshSignal={refreshSignal}
              onChange={() => setRefreshSignal((n) => n + 1)}
            />
            <p
              style={{
                textAlign: 'center',
                color: 'var(--pc-text-muted)',
                fontSize: 15,
                marginTop: 8,
              }}
            >
              새 영양제·약 검사하려면 하단 <b>🔍 검색</b> 탭으로 이동하세요.
            </p>
          </section>
        )}

        {view === 'search' && (
          <section className="page">
            <h2 className="page__title">🔍 새 제품 검사</h2>
            <SearchScreen
              refreshSignal={refreshSignal}
              onMedicationsChanged={() => setRefreshSignal((n) => n + 1)}
              onOpenDetail={setDetailTarget}
            />
          </section>
        )}

        {view === 'settings' && <SettingsPage onShowGuide={() => setGuideOpen(true)} />}
      </main>

      <BottomNav current={view} onChange={setView} />

      <DetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
