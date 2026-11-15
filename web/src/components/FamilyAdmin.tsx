import { useCallback, useEffect, useState } from 'react'
import { Copy, Share2, ShieldCheck } from 'lucide-react'
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

/** 관리자 화면 조각들 (plan.md 43, 46, 49). 가족 탭(FamilyPage)이 쓴다 */

/** 역할 이름 (화면에 보이는 말) */
export const ROLE_TEXT: Record<FamilyRole, string> = {
  member: '약 드시는 분',
  viewer: '함께 보는 가족',
}

/** 다른 계정에 관리자 주기/빼기. 내 계정은 실수로 빼지 않게 목록에서 뺀다 */
export function AdminUsers({ currentUserId }: { currentUserId: string }) {
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
    const ok = await confirm(
      giving
        ? {
            title: `${label}에게 관리자를 줄까요?`,
            message: <>모든 가족 그룹의 약을 보고, 초대를 만들고, 가족을 뺄 수 있게&nbsp;돼요.</>,
            confirmLabel: '관리자 주기',
            cancelLabel: '취소',
          }
        : {
            title: `${label}의 관리자를 뺄까요?`,
            message: <>그 계정은 함께 보는 가족으로 연결된 그룹만 보게&nbsp;돼요.</>,
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
      void load()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const others = users?.filter((u) => u.id !== currentUserId) ?? null

  return (
    <>
      <h2 className="group-label">관리자 권한</h2>
      <ul className="group family-users">
        {others === null && (
          <li>
            <p className="loading-line">
              <span className="spinner" aria-hidden="true" /> 불러오는 중
            </p>
          </li>
        )}
        {others?.length === 0 && (
          <li>
            <div className="row family-row--top">
              <span className="row__icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span className="row__body">
                <span className="row__title">함께 관리할 가족이 아직 없어요</span>
                <span className="row__sub row__sub--guide">
                  가족이 Google로 한 번 로그인하면 여기에 나와요. 그때 관리자를 줄 수&nbsp;있어요.
                </span>
              </span>
            </div>
          </li>
        )}
        {others?.map((u) => {
          const label = u.name ?? u.email ?? 'Google 계정'
          return (
            <li key={u.id}>
              <div className="row">
                <div className="row__body">
                  <div className="row__title">{label}</div>
                  <div className="row__sub">{u.role === 'admin' ? '관리자' : '함께 보는 가족'}</div>
                  {u.email && <div className="row__sub family-email">{u.email}</div>}
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

/** 새 그룹 만들기. 이름 칸에는 예시를 넣지 않는다 */
export function NewGroupForm({ onCreated, onCancel }: { onCreated: () => void; onCancel?: () => void }) {
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
    <form
      className="family-panel"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="row__title">새 그룹 만들기</div>
      <div className="row__sub row__sub--guide">집마다 그룹을 하나씩 만들면 돼요. 이름은 가족 탭에만 보여요.</div>
      <label className="family-field">
        <span className="family-field__label">그룹 이름</span>
        <span className="field field--flat">
          <input
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="off"
            autoFocus
          />
        </span>
      </label>
      <div className="family-actions">
        {onCancel && (
          <button type="button" className="btn btn--plain" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
          {busy ? '만드는 중' : '만들기'}
        </button>
      </div>
    </form>
  )
}

/** 초대할 사람 이름을 받아 초대 코드를 만든다 */
export function InviteForm({
  groupId,
  groupName,
  role,
  onCreated,
  onCancel,
}: {
  groupId: string
  groupName: string
  role: FamilyRole
  onCreated: (invite: CreatedInvite) => void
  onCancel: () => void
}) {
  const { toast } = useDialog()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

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
    <form
      className="family-panel"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="row__title">
        {groupName}에 {ROLE_TEXT[role]} 초대
      </div>
      <ol className="steps family-steps">
        <li>이름을 넣고 초대 코드를 만들어요.</li>
        <li>코드를 카톡으로 보내요.</li>
        <li>
          {role === 'member'
            ? '받은 분이 앱의 설정 → 가족 연결에 코드를 넣으면 끝이에요. 로그인은 필요 없어요.'
            : '받은 분이 링크를 열고 Google로 로그인하면 연결돼요.'}
        </li>
      </ol>
      <label className="family-field">
        <span className="family-field__label">가족에게 보일 이름</span>
        <span className="field field--flat">
          <input
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            autoFocus
          />
        </span>
      </label>
      <div className="family-actions">
        <button type="button" className="btn btn--plain" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
          {busy ? '만드는 중' : '초대 코드 만들기'}
        </button>
      </div>
    </form>
  )
}

function inviteMessage(invite: CreatedInvite): string {
  const how =
    invite.role === 'member'
      ? `아래 주소를 눌러 주세요. 앱 설정의 '가족 연결'에 코드 ${invite.code}를 넣어도 돼요.`
      : `아래 주소를 열고 Google로 로그인해 주세요. 앱 설정의 '가족 연결'에 코드 ${invite.code}를 넣어도 돼요.`
  return [`약똑똑 가족 초대예요 (${invite.displayName}).`, how, '7일 안에 한 번만 쓸 수 있어요.', invite.link].join(
    '\n',
  )
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
      <div className="row__title">{invite.displayName} 초대 코드가 생겼어요</div>
      <p className="family-code" aria-label={`초대 코드 ${invite.code.split('').join(' ')}`}>
        {shownCode}
      </p>
      <div className="row__sub row__sub--guide">
        {until}까지 한 번만 쓸 수 있어요.{' '}
        {invite.role === 'member'
          ? "받은 분이 링크를 누르거나 앱 설정의 '가족 연결'에 코드를 넣으면 돼요."
          : '받은 분이 링크를 열고 Google로 로그인하면 돼요.'}
      </div>
      <div className="family-actions">
        {canShare && (
          <button type="button" className="btn btn--primary" onClick={() => void share()}>
            <Share2 aria-hidden="true" /> 카톡 등으로 보내기
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
