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
import {
  FAMILY_CHANGED_EVENT,
  hasFamilyTab,
  previewInvite,
  savePendingJoin,
  scheduleFamilySync,
  type InvitePreview,
} from './lib/family'
import { FamilyPage } from './components/FamilyPage'
import { joinWithConsent } from './components/FamilySettings'
import { JoinElsewhereDialog } from './components/JoinElsewhereDialog'
import { friendlyError } from './lib/errors'
import { isStandaloneApp } from './lib/display-mode'

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
  // 로그인 전 기기에서 가족 탭(로그인 화면)으로 들어가는 입구: `?admin`·`?family` 주소 또는 설정의 "가족 약 함께 보기"
  const [urlEntry] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return p.has('admin') || p.has('family')
  })
  const [familyEntry, setFamilyEntry] = useState(urlEntry)

  function openFamily() {
    setFamilyEntry(true)
    setView('family')
  }
  // 로그인이 필요한 초대를 받았을 때 가족 탭을 새로 그리기 위한 값
  const [familyNonce, setFamilyNonce] = useState(0)
  // 부모님 초대 링크를 홈 화면 앱이 아닌 곳에서 열었을 때 보여 줄 안내 (plan.md 54)
  const [elsewhere, setElsewhere] = useState<{ code: string; info: InvitePreview } | null>(null)

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

  // `?admin`·`?family`로 열었으면 주소를 정리하고 가족 탭을 연다
  useEffect(() => {
    if (!urlEntry) return
    const params = new URLSearchParams(window.location.search)
    params.delete('admin')
    params.delete('family')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    setView('family')
  }, [urlEntry])

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

  function joinFromLink(code: string, info?: InvitePreview) {
    joinWithConsent(
      code,
      {
        confirm,
        toast,
        onMedicationsChanged: () => setRefreshSignal((n) => n + 1),
        onNeedLogin: handleNeedLogin,
      },
      info,
    ).catch((e) => toast(friendlyError(e), 'error'))
  }

  // 초대 링크(?join=코드)로 열었으면 연결한다. 주소의 코드는 바로 지운다(다시 열어도 또 쓰지 않게)
  // 부모님(약 드시는 분) 초대를 홈 화면 앱이 아닌 곳에서 열면 바로 잇지 않고 앱에서 넣도록 안내한다 —
  // 카톡 안 브라우저·아이폰 Safari는 홈 화면 앱과 저장 공간이 따로라, 여기서 이으면 앱의 약이 안 올라간다.
  // 함께 보는 가족 초대는 Google 계정에 묶이므로 어디서 열어도 그대로 잇는다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (!code) return
    params.delete('join')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    if (isStandaloneApp()) {
      joinFromLink(code)
      return
    }
    previewInvite(code)
      .then((info) => {
        if (info.role === 'member') setElsewhere({ code, info })
        else joinFromLink(code, info)
      })
      .catch((e) => toast(friendlyError(e), 'error'))
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
            onOpenFamily={openFamily}
          />
        )}
      </main>

      <BottomNav current={view} onChange={handleTab} showFamily={familyTab || familyEntry} />

      <DetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      {elsewhere && (
        <JoinElsewhereDialog
          code={elsewhere.code}
          info={elsewhere.info}
          onClose={() => setElsewhere(null)}
          onJoinHere={() => {
            setElsewhere(null)
            joinFromLink(elsewhere.code, elsewhere.info)
          }}
        />
      )}
    </div>
  )
}
