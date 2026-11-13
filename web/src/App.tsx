import { useEffect, useState } from 'react'
import { SearchScreen } from './components/SearchScreen'
import { RegisteredList } from './components/RegisteredList'
import { InstallHint } from './components/InstallHint'
import { BottomNav, type ViewKey } from './components/BottomNav'
import { SettingsPage } from './components/SettingsPage'
import { DetailModal, type DetailTarget } from './components/DetailModal'
import { GuideModal } from './components/GuideModal'
import { DialogProvider } from './lib/dialog'
import { initTheme } from './lib/theme'

export default function App() {
  return (
    <DialogProvider>
      <AppContent />
    </DialogProvider>
  )
}

function AppContent() {
  const [view, setView] = useState<ViewKey>('check')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [rootSignal, setRootSignal] = useState(0)

  // 탭을 누르면 상세·사용법을 닫고, 지금 탭을 다시 누르면 그 탭의 처음으로 돌아간다
  function handleTab(next: ViewKey) {
    setDetailTarget(null)
    setGuideOpen(false)
    if (next === view) setRootSignal((n) => n + 1)
    else setView(next)
  }

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
      <main className="app__main">
        {view === 'check' && (
          <>
            <header className="screen-head">
              <h1 className="screen-head__title">안녕하세요, 오늘도 건강하세요</h1>
              <p className="screen-head__desc">
                새로 산 약이나 영양제를 드시는 약이랑 같이 먹어도 되는지 알려&nbsp;드려요.
              </p>
            </header>
            <SearchScreen
              refreshSignal={refreshSignal}
              onMedicationsChanged={() => setRefreshSignal((n) => n + 1)}
              onOpenDetail={setDetailTarget}
              onShowMeds={() => setView('meds')}
              rootSignal={rootSignal}
            />
            <InstallHint />
          </>
        )}

        {view === 'meds' && (
          <>
            <header className="screen-head">
              <h1 className="screen-head__title">내 약</h1>
            </header>
            <RegisteredList
              refreshSignal={refreshSignal}
              onChange={() => setRefreshSignal((n) => n + 1)}
              onAdd={() => setView('check')}
            />
          </>
        )}

        {view === 'settings' && (
          <SettingsPage
            onShowGuide={() => setGuideOpen(true)}
            onMedicationsChanged={() => setRefreshSignal((n) => n + 1)}
          />
        )}
      </main>

      <BottomNav current={view} onChange={handleTab} />

      <DetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
