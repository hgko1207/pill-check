import { useEffect, useState } from 'react'
import { ChevronLeft, Eye, LogOut, Pill, Trash2 } from 'lucide-react'
import { useBackClose } from '../lib/back-close'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import {
  cancelInvite,
  createInvite,
  deleteGroup,
  leaveGroup,
  removeFromGroup,
  setGroupManager,
  type CreatedInvite,
  type FamilyGroupView,
  type FamilyMemberView,
  type FamilyViewerView,
  type PendingInvite,
} from '../lib/family'
import { InviteResult, ROLE_TEXT, keepHyphen } from './FamilyAdmin'

interface Props {
  open: boolean
  group: FamilyGroupView | null
  onClose: () => void
  /** 그룹 내용이 바뀌었을 때(다시 불러오기) */
  onChanged: () => void
  /** 그룹을 지웠거나 나갔을 때 */
  onGone: () => void
}

/** 그룹 관리: 관리자만 여는 덮는 화면 (plan.md 52) */
export function GroupManageSheet({ open, group, onClose, onChanged, onGone }: Props) {
  const { confirm, toast } = useDialog()
  const [busy, setBusy] = useState<string | null>(null)
  const [relink, setRelink] = useState<CreatedInvite | null>(null)

  useBackClose(open, onClose)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) setRelink(null)
  }, [open])

  if (!open || !group) return null
  const g = group
  const managers = g.viewers.filter((v) => v.isManager).length
  const meIsOnlyManager = managers <= 1

  async function run(key: string, task: () => Promise<void>, done: string) {
    setBusy(key)
    try {
      await task()
      toast(done, 'success')
      onChanged()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function toggleManager(v: FamilyViewerView) {
    const giving = !v.isManager
    const ok = await confirm(
      giving
        ? {
            title: `${v.displayName}에게 관리 권한을 줄까요?`,
            message: <>{g.name}에 가족을 초대하고, 빼고, 그룹을 관리할 수 있게&nbsp;돼요.</>,
            confirmLabel: '관리 권한 주기',
            cancelLabel: '취소',
          }
        : {
            title: `${v.displayName}의 관리 권한을 뺄까요?`,
            message: <>함께 보는 가족으로 남아 약은 계속 볼 수&nbsp;있어요.</>,
            confirmLabel: '관리 권한 빼기',
            cancelLabel: '취소',
            variant: 'danger',
          },
    )
    if (!ok) return
    await run(
      `mgr-${v.id}`,
      () => setGroupManager(g.id, v.id, giving),
      giving ? `${v.displayName}에게 관리 권한을 줬어요.` : `${v.displayName}의 관리 권한을 뺐어요.`,
    )
  }

  async function remove(person: { id: string; displayName: string }) {
    const ok = await confirm({
      title: '그룹에서 뺄까요?',
      message: (
        <>
          <b>{person.displayName}</b>
          <br />그 기기에서는 더 이상 {g.name} 연결이 되지 않고, 서버에 있는 정보도 지워져요. 그 휴대폰의 내 약은
          그대로&nbsp;있어요.
        </>
      ),
      confirmLabel: '빼기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    await run(`rm-${person.id}`, () => removeFromGroup(g.id, person.id), `${person.displayName} 연결을 끊었어요.`)
  }

  async function cancel(i: PendingInvite) {
    const ok = await confirm({
      title: '이 초대를 취소할까요?',
      message: (
        <>
          <b>{i.displayName}</b>
          <br />보낸 초대 코드를 더 이상 쓸 수 없게 돼요. 다시 초대하려면 새 코드를 만들어&nbsp;주세요.
        </>
      ),
      confirmLabel: '초대 취소',
      cancelLabel: '그대로 두기',
      variant: 'danger',
    })
    if (!ok) return
    await run(`inv-${i.id}`, () => cancelInvite(g.id, i.id), `${i.displayName} 초대를 취소했어요.`)
  }

  async function relinkMember(m: FamilyMemberView) {
    setBusy(`relink-${m.id}`)
    try {
      setRelink(await createInvite(g.id, { memberId: m.id }))
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function leave() {
    const ok = await confirm({
      title: `${g.name}에서 나갈까요?`,
      message: <>이 그룹 가족의 약을 더 이상 볼 수 없어요. 다시 보려면 관리자에게 초대를 받아야&nbsp;해요.</>,
      confirmLabel: '나가기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    setBusy('leave')
    try {
      await leaveGroup(g.id)
      toast(`${g.name}에서 나왔어요.`, 'success')
      onGone()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function removeGroup() {
    const ok = await confirm({
      title: `${g.name} 그룹을 지울까요?`,
      message: (
        <>
          약 드시는 분과 함께 보는 가족의 연결, 남은 초대가 모두 지워지고 되돌릴 수 없어요. 각자 휴대폰의 내 약은
          그대로&nbsp;있어요.
        </>
      ),
      confirmLabel: '그룹 지우기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    setBusy('delete')
    try {
      await deleteGroup(g.id)
      toast(`${g.name} 그룹을 지웠어요.`, 'success')
      onGone()
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="group-manage-title">
      <div className="sheet__body">
        <div className="topbar">
          <button type="button" className="topbar__back" onClick={onClose} aria-label="뒤로">
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>
        <header className="detail-head">
          <h1 id="group-manage-title" className="detail-head__title">
            {g.name} 관리
          </h1>
          <p className="detail-head__sub">이 그룹의 관리자만 볼 수 있어요.</p>
        </header>

        <h2 className="group-label">{ROLE_TEXT.viewer}</h2>
        <ul className="group">
          {g.viewers.map((v) => (
            <li key={v.id} className="family-member">
              <div className="row family-member__head">
                <span className="row__icon" aria-hidden="true">
                  <Eye />
                </span>
                <div className="row__body">
                  <div className="row__title">
                    {v.displayName}
                    {v.isMe && <span className="family-me"> (나)</span>}
                    {v.isManager && (
                      <>
                        {' '}
                        <span className="tag tag--primary">관리자</span>
                      </>
                    )}
                  </div>
                  {v.accountEmail && <div className="row__sub family-email">{keepHyphen(v.accountEmail)}</div>}
                </div>
              </div>
              {!v.isMe && (
                <div className="family-member__actions">
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => void toggleManager(v)}
                    disabled={busy !== null}
                    aria-label={`${v.displayName} ${v.isManager ? '관리 권한 빼기' : '관리 권한 주기'}`}
                  >
                    {v.isManager ? '관리 권한 빼기' : '관리 권한 주기'}
                  </button>
                  <button
                    type="button"
                    className="text-btn text-btn--danger"
                    onClick={() => void remove(v)}
                    disabled={busy !== null}
                    aria-label={`${v.displayName} 그룹에서 빼기`}
                  >
                    그룹에서 빼기
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="family-note">관리 권한을 받은 분은 초대를 만들고 가족을 뺄 수 있어요.</p>

        <h2 className="group-label">{ROLE_TEXT.member}</h2>
        <ul className="group">
          {g.members.length === 0 && (
            <li>
              <div className="row">
                <span className="row__body">
                  <span className="row__sub row__sub--guide">아직 연결된 분이 없어요.</span>
                </span>
              </div>
            </li>
          )}
          {g.members.map((m) => (
            <li key={m.id} className="family-member">
              <div className="row family-member__head">
                <span className="row__icon" aria-hidden="true">
                  <Pill />
                </span>
                <div className="row__body">
                  <div className="row__title">{m.displayName}</div>
                  <div className="row__sub">
                    {m.connected ? `약 ${m.meds.length}개` : '새 휴대폰 연결을 기다리는 중'}
                  </div>
                </div>
              </div>
              <div className="family-member__actions">
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => void relinkMember(m)}
                  disabled={busy !== null}
                  aria-label={`${m.displayName} 새 폰으로 다시 연결`}
                >
                  새 폰으로 다시 연결
                </button>
                <button
                  type="button"
                  className="text-btn text-btn--danger"
                  onClick={() => void remove(m)}
                  disabled={busy !== null}
                  aria-label={`${m.displayName} 그룹에서 빼기`}
                >
                  그룹에서 빼기
                </button>
              </div>
            </li>
          ))}
        </ul>
        {relink && <InviteResult invite={relink} onClose={() => setRelink(null)} />}

        {g.pendingInvites.length > 0 && (
          <>
            <h2 className="group-label">아직 연결 안 된 초대</h2>
            <ul className="group">
              {g.pendingInvites.map((i) => (
                <li key={i.id} className="family-member">
                  <div className="row family-member__head">
                    <div className="row__body">
                      <div className="row__title">{i.displayName}</div>
                      <div className="row__sub">{i.memberId ? '새 폰으로 다시 연결' : ROLE_TEXT[i.role]}</div>
                      <div className="row__sub">
                        {new Date(i.expiresAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}까지 쓸 수
                        있어요
                      </div>
                    </div>
                  </div>
                  <div className="family-member__actions">
                    <button
                      type="button"
                      className="text-btn text-btn--danger"
                      onClick={() => void cancel(i)}
                      disabled={busy !== null}
                      aria-label={`${i.displayName} 초대 취소`}
                    >
                      초대 취소
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="group-label">그룹</h2>
        <ul className="group">
          <li>
            {meIsOnlyManager ? (
              // 누를 수 없는 이유 문장은 흐리게 하지 않는다 (제목과 아이콘만 흐리게)
              <div className="row family-row--top" aria-disabled="true">
                <span className="row__icon family-off" aria-hidden="true">
                  <LogOut />
                </span>
                <span className="row__body">
                  <span className="row__title family-off__title">그룹 나가기</span>
                  <span className="row__sub row__sub--guide">
                    관리자가 나 혼자예요. 다른 가족에게 관리 권한을 준 뒤 나갈 수&nbsp;있어요.
                  </span>
                </span>
              </div>
            ) : (
              <button type="button" className="row" onClick={() => void leave()} disabled={busy !== null}>
                <span className="row__icon" aria-hidden="true">
                  <LogOut />
                </span>
                <span className="row__body">
                  <span className="row__title">그룹 나가기</span>
                </span>
              </button>
            )}
          </li>
          <li>
            <button type="button" className="row row--danger" onClick={() => void removeGroup()} disabled={busy !== null}>
              <span className="row__icon row__icon--danger" aria-hidden="true">
                <Trash2 />
              </span>
              <span className="row__body">
                <span className="row__title">{busy === 'delete' ? '지우는 중' : '그룹 지우기'}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
}
