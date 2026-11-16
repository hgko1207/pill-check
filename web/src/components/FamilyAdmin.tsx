import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import { createGroup, createInvite, type CreatedInvite, type FamilyRole } from '../lib/family'

/** 가족 탭 조각들 (plan.md 43, 46, 49, 52). 가족 탭(FamilyPage)·그룹 관리 화면이 쓴다 */

/** 메일 주소가 하이픈에서 줄바꿈되지 않게 줄바꿈 없는 하이픈(U+2011)으로 바꾼다 */
export function keepHyphen(text: string): string {
  return text.replace(/-/g, '‑')
}

/** 역할 이름 (화면에 보이는 말) */
export const ROLE_TEXT: Record<FamilyRole, string> = {
  member: '약 드시는 분',
  viewer: '함께 보는 가족',
}

/** 새 그룹 만들기. 이름 칸에는 예시를 넣지 않는다 */
export function NewGroupForm({ onCreated, onCancel }: { onCreated: (groupId: string) => void; onCancel?: () => void }) {
  const { toast } = useDialog()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const group = await createGroup(trimmed)
      setName('')
      toast(`${trimmed} 그룹을 만들었어요. 이제 가족을 초대해 보세요.`, 'success')
      onCreated(group.id)
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
      <div className="row__sub row__sub--guide">집마다 그룹을 하나씩 만들면 돼요. 만든 사람이 그 그룹의 관리자가 돼요.</div>
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
      onCreated(await createInvite(groupId, { role, displayName: trimmed }))
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
            ? '받은 분이 홈 화면의 약똑똑을 열고 설정 → 가족 연결에 코드를 넣으면 끝이에요. 로그인은 필요 없어요.'
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
      ? [
          `휴대폰 홈 화면의 약똑똑을 열고, 설정 → 가족 연결에 코드 ${invite.code}를 넣어 주세요.`,
          '약똑똑이 아직 없으면 아래 주소를 열어 홈 화면에 추가해 주세요.',
        ]
      : [`아래 주소를 열고 Google로 로그인해 주세요. 앱 설정의 '가족 연결'에 코드 ${invite.code}를 넣어도 돼요.`]
  return [`약똑똑 가족 초대예요 (${invite.displayName}).`, ...how, '7일 안에 한 번만 쓸 수 있어요.', invite.link].join(
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
          ? '받은 분이 홈 화면의 약똑똑을 열고 설정 → 가족 연결에 코드를 넣으면 돼요.'
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
