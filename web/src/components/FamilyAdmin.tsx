import { useCallback, useEffect, useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import {
  adminCreateGroup,
  adminCreateInvite,
  adminListUsers,
  adminSetRole,
  type AuthUser,
  type CreatedInvite,
  type FamilyRole,
} from '../lib/family'

/** 관리자 화면 조각들 (plan.md 43, 46). 가족 탭(FamilyPage)이 쓴다 */

/** 로그인한 계정 목록과 관리자 주기/빼기 */
export function AdminUsers({
  currentUserId,
  onSelfRoleChanged,
}: {
  currentUserId: string
  onSelfRoleChanged: () => void
}) {
  const { confirm, toast } = useDialog()
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await adminListUsers())
    } catch (e) {
      toast(friendlyError(e), 'error')
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(u: AuthUser) {
    const label = u.name ?? u.email ?? '이 계정'
    const giving = u.role !== 'admin'
    const self = u.id === currentUserId
    const ok = await confirm(
      giving
        ? {
            title: `${label}에게 관리자를 줄까요?`,
            message: <>모든 가족 그룹의 약을 보고, 초대를 만들고, 사람을 뺄 수 있게&nbsp;돼요.</>,
            confirmLabel: '관리자 주기',
            cancelLabel: '취소',
          }
        : {
            title: self ? '내 관리자 권한을 뺄까요?' : `${label}의 관리자를 뺄까요?`,
            message: self ? (
              <>다시 받으려면 다른 관리자에게 부탁해야&nbsp;해요.</>
            ) : (
              <>그룹을 보는 것은 그 계정이 보는 사람으로 연결된 그룹만 남아요.</>
            ),
            confirmLabel: '관리자 빼기',
            cancelLabel: '취소',
            variant: 'danger',
          },
    )
    if (!ok) return
    setBusyId(u.id)
    try {
      await adminSetRole(u.id, giving ? 'admin' : 'user')
      toast(giving ? `${label}에게 관리자를 줬어요.` : `${label}의 관리자를 뺐어요.`, 'success')
      if (self) onSelfRoleChanged()
      else void load()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <h2 className="group-label">관리자</h2>
      <p className="group-note family-users-note">
        로그인한 계정이에요. 관리자는 모든 그룹을 보고 초대를 만들 수&nbsp;있어요.
      </p>
      <ul className="group family-users">
        {users === null && (
          <li>
            <p className="loading-line">
              <span className="spinner" aria-hidden="true" /> 불러오는 중
            </p>
          </li>
        )}
        {users?.map((u) => {
          const label = u.name ?? u.email ?? 'Google 계정'
          return (
            <li key={u.id}>
              <div className="row">
                <div className="row__body">
                  <div className="row__title">
                    {label}
                    {u.id === currentUserId && <span className="family-users__me"> (나)</span>}
                  </div>
                  <div className="row__sub">
                    {u.email ?? ''}
                    {u.role === 'admin' && (
                      <>
                        {' '}
                        <span className="tag tag--primary">관리자</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={`text-btn${u.role === 'admin' ? ' text-btn--danger' : ''}`}
                  onClick={() => void toggle(u)}
                  disabled={busyId === u.id}
                  aria-label={`${label} ${u.role === 'admin' ? '관리자 빼기' : '관리자 주기'}`}
                >
                  {u.role === 'admin' ? '관리자 빼기' : '관리자 주기'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** 새 그룹 만들기 (예: 우리 집, 처가) */
export function NewGroupForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useDialog()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await adminCreateGroup(trimmed)
      setName('')
      toast(`${trimmed} 그룹을 만들었어요.`, 'success')
      onCreated()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className="group-label">새 그룹 만들기</h2>
      <div className="group">
        <div className="setting">
          <form
            className="family-form"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label className="field field--flat">
              <span className="sr-only">그룹 이름</span>
              <input
                className="field__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 우리 집, 처가"
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn btn--primary btn--small" disabled={busy || !name.trim()}>
              {busy ? '만드는 중' : '만들기'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

/** 초대할 사람 이름을 받아 초대를 만든다 */
export function InviteForm({
  groupId,
  role,
  onCreated,
  onCancel,
}: {
  groupId: string
  role: FamilyRole
  onCreated: (invite: CreatedInvite) => void
  onCancel: () => void
}) {
  const { toast } = useDialog()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const roleText = role === 'member' ? '약을 등록하는 분' : '보는 사람'

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      onCreated(await adminCreateInvite({ groupId, role, displayName: trimmed }))
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="family-panel">
      <div className="row__title">{roleText} 초대</div>
      <div className="row__sub row__sub--guide">가족에게 보일 이름을 넣어 주세요. 예: 아버지, 큰딸</div>
      <form
        className="family-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="field field--flat">
          <span className="sr-only">이름</span>
          <input
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn--primary btn--small" disabled={busy || !name.trim()}>
          {busy ? '만드는 중' : '초대 만들기'}
        </button>
      </form>
      <button type="button" className="text-btn family-panel__cancel" onClick={onCancel}>
        취소
      </button>
    </div>
  )
}

function inviteMessage(invite: CreatedInvite): string {
  return [
    `약똑똑 가족 연결 초대예요 (${invite.displayName}).`,
    '아래 주소를 눌러 주세요.',
    `앱 설정의 '가족 연결'에 코드 ${invite.code}를 넣어도 돼요. 7일 안에 한 번만 쓸 수 있어요.`,
    invite.link,
  ].join('\n')
}

/** 만든 초대: 코드 크게, 공유·복사 */
export function InviteResult({ invite, onClose }: { invite: CreatedInvite; onClose: () => void }) {
  const { toast } = useDialog()
  const canShare = typeof navigator.share === 'function'
  const shownCode = `${invite.code.slice(0, 4)} ${invite.code.slice(4)}`
  const until = new Date(invite.expiresAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

  async function share() {
    try {
      await navigator.share({ title: '약똑똑 가족 초대', text: inviteMessage(invite) })
    } catch {
      /* 사용자가 공유 창을 닫음 */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteMessage(invite))
      toast('초대 내용을 복사했어요. 카톡에 붙여 넣어 보내 주세요.', 'success')
    } catch {
      toast('복사하지 못했어요. 아래 코드를 직접 알려 주세요.', 'error')
    }
  }

  return (
    <div className="family-panel" role="region" aria-label={`${invite.displayName} 초대`}>
      <div className="row__title">{invite.displayName} 초대를 만들었어요</div>
      <p className="family-code" aria-label={`초대 코드 ${invite.code.split('').join(' ')}`}>
        {shownCode}
      </p>
      <div className="row__sub row__sub--guide">
        {until}까지 한 번만 쓸 수 있어요. 받은 분이 링크를 누르거나 앱 설정의 '가족 연결'에 코드를
        넣으면&nbsp;돼요.
      </div>
      <div className="family-actions">
        {canShare && (
          <button type="button" className="btn btn--primary" onClick={() => void share()}>
            <Share2 aria-hidden="true" /> 공유하기
          </button>
        )}
        <button type="button" className={`btn ${canShare ? 'btn--plain' : 'btn--primary'}`} onClick={() => void copy()}>
          <Copy aria-hidden="true" /> 복사하기
        </button>
      </div>
      <button type="button" className="text-btn family-panel__cancel" onClick={onClose}>
        닫기
      </button>
    </div>
  )
}
