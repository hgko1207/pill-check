import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, RefreshCw, UserPlus, Eye } from 'lucide-react'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import {
  adminCreateInvite,
  adminRemoveMember,
  clearAdminKey,
  getAdminKey,
  getFamilyView,
  type CreatedInvite,
  type FamilyGroupView,
  type FamilyMemberView,
  type FamilyRole,
} from '../lib/family'
import { AdminKeyForm, InviteForm, InviteResult, NewGroupForm } from './FamilyAdmin'

/** "3일 전" 같은 마지막 사용 시각 */
function lastSeenText(at: number | null): string {
  if (!at) return '아직 쓰지 않음'
  const min = Math.floor((Date.now() - at) / 60000)
  if (min < 60) return '방금 전'
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

interface Props {
  /** `?admin`으로 열어 관리자 키 입력을 보여 줄지 */
  adminEntry: boolean
}

/** 가족 탭 (plan.md 43): 보는 사람·관리자만 보인다 */
export function FamilyPage({ adminEntry }: Props) {
  const { confirm, toast } = useDialog()
  const [adminKey, setAdminKey] = useState(() => getAdminKey())
  const [groups, setGroups] = useState<FamilyGroupView[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [inviteForm, setInviteForm] = useState<{ groupId: string; role: FamilyRole } | null>(null)
  const [invite, setInvite] = useState<{ groupId: string; data: CreatedInvite } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGroups(await getFamilyView())
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, adminKey])

  const isAdmin = Boolean(adminKey)

  async function removeMember(m: FamilyMemberView) {
    const ok = await confirm({
      title: `${m.displayName}을(를) 뺄까요?`,
      message: (
        <>
          그 기기에서는 더 이상 가족 연결이 되지 않고, 서버에 있는 정보도 지워져요. 그 휴대폰의 내 약은
          그대로&nbsp;있어요.
        </>
      ),
      confirmLabel: '빼기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await adminRemoveMember(m.id)
      toast(`${m.displayName}을(를) 뺐어요.`, 'success')
      void load()
    } catch (e) {
      toast(friendlyError(e), 'error')
    }
  }

  /** 폰을 바꾼 분: 같은 자리로 다시 잇는 초대. 새 폰에서 연결하면 이전 폰은 끊긴다 (plan.md 44) */
  async function relinkMember(groupId: string, m: FamilyMemberView) {
    try {
      const data = await adminCreateInvite({ groupId, memberId: m.id })
      setInviteForm(null)
      setInvite({ groupId, data })
    } catch (e) {
      toast(friendlyError(e), 'error')
    }
  }

  function leaveAdmin() {
    clearAdminKey()
    setAdminKey(null)
    setInvite(null)
    setInviteForm(null)
  }

  const showKeyForm = !isAdmin && adminEntry

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">가족</h1>
        <p className="screen-head__desc">가족이 내 약에 등록한 약과 영양제예요.</p>
      </header>

      {showKeyForm && <AdminKeyForm onSaved={() => setAdminKey(getAdminKey())} />}

      {loading && !groups && (
        <p className="loading-line">
          <span className="spinner" aria-hidden="true" /> 불러오는 중
        </p>
      )}

      {error != null && (
        <div className="notice notice--error family-notice" role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{friendlyError(error)}</span>
        </div>
      )}

      {groups && groups.length === 0 && !showKeyForm && (
        <p className="group-note family-empty">
          {isAdmin ? '아직 그룹이 없어요. 아래에서 새 그룹을 만들어 주세요.' : '연결된 가족이 없어요.'}
        </p>
      )}

      {groups?.map((g) => (
        <section key={g.id} aria-label={g.name}>
          <h2 className="group-label">{g.name}</h2>

          {g.error != null ? (
            <div className="notice notice--error family-notice">
              <AlertCircle aria-hidden="true" />
              <span>{friendlyError(g.error)}</span>
            </div>
          ) : (
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
                    <div className="row__body">
                      <div className="row__title">{m.displayName}</div>
                      <div className="row__sub">
                        {m.connected ? `마지막 사용 ${lastSeenText(m.lastSeenAt)}` : '새 휴대폰 연결을 기다리는 중'}
                        {' · '}약 <span className="num">{m.meds.length}</span>개
                      </div>
                    </div>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => void relinkMember(g.id, m)}
                          aria-label={`${m.displayName} 다시 연결`}
                        >
                          다시 연결
                        </button>
                        <button
                          type="button"
                          className="text-btn text-btn--danger"
                          onClick={() => void removeMember(m)}
                          aria-label={`${m.displayName} 빼기`}
                        >
                          빼기
                        </button>
                      </>
                    )}
                  </div>
                  {m.meds.length === 0 ? (
                    <p className="family-meds__empty">등록한 약이 없어요.</p>
                  ) : (
                    <ul className="family-meds">
                      {m.meds.map((med) => (
                        <li key={med.itemSeq} className="family-meds__item">
                          <span className="family-meds__name">{med.itemName}</span>
                          <span className={`tag ${med.kind === 'healthfood' ? '' : 'tag--primary'}`}>
                            {med.kind === 'healthfood' ? '영양제' : '의약품'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {g.viewers.length > 0 &&
            (isAdmin ? (
              <ul className="group family-viewers">
                {g.viewers.map((v) => (
                  <li key={v.id}>
                    <div className="row">
                      <div className="row__body">
                        <div className="row__title">{v.displayName}</div>
                        <div className="row__sub">보는 사람</div>
                      </div>
                      <button
                        type="button"
                        className="text-btn text-btn--danger"
                        onClick={() => void removeMember(v)}
                        aria-label={`${v.displayName} 빼기`}
                      >
                        빼기
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="group-note">보는 사람: {g.viewers.map((v) => v.displayName).join(', ')}</p>
            ))}

          {isAdmin && (
            <>
              {invite?.groupId === g.id ? (
                <InviteResult invite={invite.data} onClose={() => setInvite(null)} />
              ) : inviteForm?.groupId === g.id ? (
                <InviteForm
                  groupId={g.id}
                  role={inviteForm.role}
                  onCancel={() => setInviteForm(null)}
                  onCreated={(data) => {
                    setInviteForm(null)
                    setInvite({ groupId: g.id, data })
                    void load()
                  }}
                />
              ) : (
                <div className="family-actions family-actions--group">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      setInvite(null)
                      setInviteForm({ groupId: g.id, role: 'member' })
                    }}
                  >
                    <UserPlus aria-hidden="true" /> 부모님 초대
                  </button>
                  <button
                    type="button"
                    className="btn btn--plain"
                    onClick={() => {
                      setInvite(null)
                      setInviteForm({ groupId: g.id, role: 'viewer' })
                    }}
                  >
                    <Eye aria-hidden="true" /> 보는 사람 초대
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ))}

      {isAdmin && <NewGroupForm onCreated={() => void load()} />}

      {(groups || error != null) && (
        <div className="block-actions">
          <button type="button" className="btn btn--plain" onClick={() => void load()} disabled={loading}>
            <RefreshCw aria-hidden="true" /> {loading ? '불러오는 중' : '새로 고침'}
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="block-actions">
          <button type="button" className="text-btn" onClick={leaveAdmin}>
            이 기기에서 관리자 키 지우기
          </button>
        </div>
      )}
    </>
  )
}
