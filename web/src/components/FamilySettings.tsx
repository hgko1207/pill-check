import { useEffect, useState } from 'react'
import { Unlink, Users } from 'lucide-react'
import { useDialog, type ConfirmOptions } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import {
  FamilyRequestError,
  getMemberLink,
  getMyFamily,
  joinFamily,
  leaveFamily,
  previewInvite,
  settleAfterJoin,
  type JoinResult,
  type MemberLink,
} from '../lib/family'

/**
 * 연결 직후 마무리: 폰을 바꿔 다시 이은 경우 저장돼 있던 약을 불러올지 묻고, 결과를 알린다 (plan.md 44).
 * App(초대 링크)과 설정(코드 입력)이 같이 쓴다.
 */
export async function finishFamilyJoin(
  res: JoinResult,
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  toast: (message: string, type?: 'success' | 'info' | 'error') => void,
  onMedicationsChanged?: () => void,
): Promise<void> {
  toast(
    res.role === 'member' ? `${res.groupName}에 연결됐어요.` : `${res.groupName}의 약을 볼 수 있게 됐어요.`,
    'success',
  )
  const restored = await settleAfterJoin(res, (count) =>
    confirm({
      title: '저장돼 있던 약을 불러올까요?',
      message: (
        <>
          전에 쓰던 휴대폰에서 등록한 약 <b>{count}개</b>가 저장돼 있어요. 이 휴대폰의 내 약에 넣을까요?
        </>
      ),
      confirmLabel: '불러오기',
      cancelLabel: '안 불러오기',
    }),
  )
  if (restored > 0) {
    onMedicationsChanged?.()
    toast(`약 ${restored}개를 내 약에 넣었어요.`, 'success')
  }
}

interface JoinDeps {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  toast: (message: string, type?: 'success' | 'info' | 'error') => void
  onMedicationsChanged?: () => void
  onNeedLogin?: (code: string) => void
}

/**
 * 초대 코드로 연결하는 전체 흐름 (plan.md 47). App(초대 링크)과 설정(코드 입력)이 같이 쓴다.
 * 1) 코드를 쓰지 않고 어떤 초대인지 본다
 * 2) 구성원(부모님) 초대면 무엇이·누구에게·어디에 저장되는지 보여 주고 동의를 받는다 — 취소하면 코드는 그대로
 * 3) 연결한다. 보는 사람 초대인데 로그인 전이면 onNeedLogin으로 넘긴다
 * 돌려주는 값: 'joined' | 'cancelled' | 'need_login'. 그 밖의 실패는 던진다.
 */
export async function joinWithConsent(code: string, deps: JoinDeps): Promise<'joined' | 'cancelled' | 'need_login'> {
  const info = await previewInvite(code)
  if (info.role === 'member') {
    const ok = await deps.confirm({
      title: `${info.groupName}에 '${info.displayName}'(으)로 연결할까요?`,
      message: (
        <>
          연결하면 아래 내용이 가족에게 보여요.
          <ul className="consent-list">
            <li>
              <b>보이는 것</b>: 내 약에 등록한 약·영양제 이름과 성분, 제조사, 마지막으로 앱을 쓴&nbsp;때
            </li>
            <li>
              <b>보는 사람</b>: 이 그룹에 연결된 가족과 앱을 관리하는&nbsp;가족
            </li>
            <li>
              <b>저장하는 곳</b>: 해외에 있는 클라우드 서버(Cloudflare)
            </li>
            <li>
              <b>그만두려면</b>: 설정 → 가족 연결 끊기. 누르면 서버에서&nbsp;지워져요
            </li>
          </ul>
        </>
      ),
      confirmLabel: '동의하고 연결',
      cancelLabel: '취소',
    })
    if (!ok) return 'cancelled'
  }
  try {
    const res = await joinFamily(code)
    await finishFamilyJoin(res, deps.confirm, deps.toast, deps.onMedicationsChanged)
    return 'joined'
  } catch (e) {
    if (e instanceof FamilyRequestError && e.code === 'login_required' && deps.onNeedLogin) {
      deps.onNeedLogin(code)
      return 'need_login'
    }
    throw e
  }
}

interface Props {
  onMedicationsChanged?: () => void
  /** 보는 사람 초대인데 로그인 전일 때: 코드를 넘겨 가족 탭 로그인 화면으로 */
  onNeedLogin?: (code: string) => void
}

/** 설정 안 "가족 연결" 묶음 (plan.md 42) */
export function FamilySettings({ onMedicationsChanged, onNeedLogin }: Props) {
  const { confirm, toast } = useDialog()
  const [member, setMember] = useState<MemberLink | null>(() => getMemberLink())
  const [viewers, setViewers] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  // 연결돼 있으면 볼 수 있는 사람을 서버에서 받아 온다
  useEffect(() => {
    if (!member) return
    let cancelled = false
    getMyFamily()
      .then((info) => {
        if (cancelled) return
        if (!info) setMember(null)
        else setViewers(info.viewers)
      })
      .catch(() => {
        // 토큰이 무효면 family.ts가 연결 정보를 지웠다
        if (!cancelled) setMember(getMemberLink())
      })
    return () => {
      cancelled = true
    }
  }, [member])

  async function handleJoin() {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const result = await joinWithConsent(trimmed, { confirm, toast, onMedicationsChanged, onNeedLogin })
      if (result !== 'cancelled') setCode('')
      setMember(getMemberLink())
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    const ok = await confirm({
      title: '가족 연결을 끊을까요?',
      message: (
        <>
          가족이 더 이상 내 약 목록을 볼 수 없고, 서버에 저장된 내 약 목록도 지워져요. 이 휴대폰의
          내 약은 그대로&nbsp;있어요.
        </>
      ),
      confirmLabel: '연결 끊기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await leaveFamily()
      setMember(null)
      setViewers(null)
      toast('가족 연결을 끊었어요.', 'success')
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (member) {
    return (
      <>
        <h2 className="group-label">가족 연결</h2>
        <div className="group">
          <div className="row family-status">
            <span className="row__icon" aria-hidden="true">
              <Users />
            </span>
            <span className="row__body">
              <span className="row__title">{member.groupName}에 연결돼 있어요</span>
              <span className="row__sub row__sub--guide">
                내 약 목록이 가족에게 보여요.
                {viewers && viewers.length > 0 && (
                  <>
                    {' '}
                    볼&nbsp;수&nbsp;있는&nbsp;사람: <b>{viewers.join(', ')}</b>.
                  </>
                )}{' '}
                앱을 관리하는 가족도 볼 수&nbsp;있어요.
              </span>
            </span>
          </div>
          <button
            type="button"
            className="row row--danger"
            onClick={() => void handleLeave()}
            disabled={busy}
          >
            <span className="row__icon row__icon--danger" aria-hidden="true">
              <Unlink />
            </span>
            <span className="row__body">
              <span className="row__title">{busy ? '끊는 중' : '가족 연결 끊기'}</span>
            </span>
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="group-label">가족 연결</h2>
      <div className="group">
        <div className="setting">
          <div className="setting__text">
            <div className="row__title">가족과 연결하기</div>
            <div className="row__sub row__sub--guide">
              자녀에게 받은 초대 코드 8자리를 넣으면 드시는 약 목록을 가족이 함께 볼 수&nbsp;있어요.
            </div>
          </div>
          <form
            className="family-form"
            onSubmit={(e) => {
              e.preventDefault()
              void handleJoin()
            }}
          >
            <label className="field field--flat">
              <span className="sr-only">초대 코드</span>
              <input
                className="field__input family-form__input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="8자리 코드"
                maxLength={12}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </label>
            <button type="submit" className="btn btn--primary btn--small" disabled={busy || !code.trim()}>
              {busy ? '연결 중' : '연결'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
