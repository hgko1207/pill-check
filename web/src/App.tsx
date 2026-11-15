import { useEffect, useState } from 'react'
import { SearchScreen } from './components/SearchScreen'
import { RegisteredList } from './components/RegisteredList'
import { InstallHint } from './components/InstallHint'
import { BottomNav, type ViewKey } from './components/BottomNav'
import { SettingsPage } from './components/SettingsPage'
import { DetailModal, type DetailTarget } from './components/DetailModal'
import { GuideModal } from './components/GuideModal'
import { DialogProvider, useDialog } from './lib/dialog'
import { initTheme } from './lib/theme'
import { FAMILY_CHANGED_EVENT, hasFamilyTab, savePendingJoin, scheduleFamilySync } from './lib/family'
import { FamilyPage } from './components/FamilyPage'
import { joinWithConsent } from './components/FamilySettings'
import { friendlyError } from './lib/errors'

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
  const { confirm, toast } = useDialog()
  const [familyTab, setFamilyTab] = useState(() => hasFamilyTab())
  // 로그인 전 기기에서 가족 탭(로그인 화면)으로 들어가는 입구: `?admin` 주소
  const [adminEntry] = useState(() => new URLSearchParams(window.location.search).has('admin'))
  // 로그인이 필요한 초대를 받았을 때 가족 탭을 새로 그리기 위한 값
  const [familyNonce, setFamilyNonce] = useState(0)

  /** 보는 사람 초대인데 로그인 전: 코드를 보관하고 가족 탭 로그인 화면으로 */
  function handleNeedLogin(code: string) {
    savePendingJoin(code)
    setFamilyNonce((n) => n + 1)
    setView('family')
  }

  // 로그인·연결이 바뀌면 가족 탭 표시를 다시 정한다
  useEffect(() => {
    const update = () => setFamilyTab(hasFamilyTab())
    window.addEventListener(FAMILY_CHANGED_EVENT, update)
    return () => window.removeEventListener(FAMILY_CHANGED_EVENT, update)
  }, [])

  // `?admin`으로 열었으면 주소를 정리하고 가족 탭을 연다
  useEffect(() => {
    if (!adminEntry) return
    const params = new URLSearchParams(window.location.search)
    params.delete('admin')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    setView('family')
  }, [adminEntry])

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

  // 초대 링크(?join=코드)로 열었으면 연결한다. 주소의 코드는 바로 지운다(다시 열어도 또 쓰지 않게)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (!code) return
    params.delete('join')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    joinWithConsent(code, {
      confirm,
      toast,
      onMedicationsChanged: () => setRefreshSignal((n) => n + 1),
      onNeedLogin: handleNeedLogin,
    }).catch((e) => toast(friendlyError(e), 'error'))
  }, [confirm, toast])

  // 가족과 연결된 기기면 앱을 열 때와 등록약이 바뀔 때 목록을 올린다(연결 안 됐으면 아무것도 안 함)
  useEffect(() => {
    scheduleFamilySync(refreshSignal === 0 ? 0 : undefined)
  }, [refreshSignal])

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

        {view === 'family' && <FamilyPage key={`${rootSignal}-${familyNonce}`} />}

        {view === 'settings' && (
          <SettingsPage
            onShowGuide={() => setGuideOpen(true)}
            onMedicationsChanged={() => setRefreshSignal((n) => n + 1)}
            onNeedFamilyLogin={handleNeedLogin}
          />
        )}
      </main>

      <BottomNav current={view} onChange={handleTab} showFamily={familyTab || adminEntry} />

      <DetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
