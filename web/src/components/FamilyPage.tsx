import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ChevronRight, Eye, Pill, Plus, RefreshCw, User, UserPlus, Users } from 'lucide-react'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import { disableGoogleAutoSelect } from '../lib/auth'
import {
  adminCreateInvite,
  adminRemoveMember,
  clearPendingJoin,
  getFamilyView,
  getPendingJoin,
  getSessionUser,
  joinFamily,
  previewInvite,
  refreshSessionUser,
  signOut,
  type AuthUser,
  type CreatedInvite,
  type FamilyGroupView,
  type FamilyMemberView,
  type FamilyRole,
  type InvitePreview,
} from '../lib/family'
import { AdminUsers, InviteForm, InviteResult, NewGroupForm, ROLE_TEXT } from './FamilyAdmin'
import { GoogleSignInButton } from './GoogleSignInButton'

/** "3일 전" 같은 마지막 사용 시각 */
function lastSeenText(at: number | null): string {
  if (!at) return '아직 쓰지 않음'
  const min = Math.floor((Date.now() - at) / 60000)
  if (min < 60) return '방금 전'
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

/** 가족 탭 (plan.md 43, 46, 49): 관리자·함께 보는 가족이 Google 로그인으로 쓴다 */
export function FamilyPage() {
  const { confirm, toast } = useDialog()
  const [user, setUser] = useState<AuthUser | null>(() => getSessionUser())
  const [pending, setPending] = useState<string | null>(() => getPendingJoin())
  const [pendingInfo, setPendingInfo] = useState<InvitePreview | null>(null)
  const [groups, setGroups] = useState<FamilyGroupView[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [inviteForm, setInviteForm] = useState<{ groupId: string; role: FamilyRole } | null>(null)
  const [invite, setInvite] = useState<{ groupId: string; data: CreatedInvite } | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGroups(await getFamilyView())
    } catch (e) {
      setError(e)
      // 세션이 끝났으면 family.ts가 지웠다 → 로그인 화면으로
      if (!getSessionUser()) setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // 로그인이 필요한 초대를 들고 있으면 어떤 그룹인지 보여 준다
  useEffect(() => {
    if (!pending) {
      setPendingInfo(null)
      return
    }
    let cancelled = false
    previewInvite(pending)
      .then((info) => {
        if (!cancelled) setPendingInfo(info)
      })
      .catch((e) => {
        if (cancelled) return
        toast(friendlyError(e), 'error')
        clearPendingJoin()
        setPending(null)
      })
    return () => {
      cancelled = true
    }
  }, [pending, toast])

  // 로그인돼 있으면: 역할을 서버와 맞추고 → 들고 있던 초대를 잇고 → 목록을 불러온다
  useEffect(() => {
    if (!user) {
      setGroups(null)
      return
    }
    let cancelled = false
    ;(async () => {
      let fresh: AuthUser | null = user
      try {
        fresh = await refreshSessionUser()
      } catch {
        // 서버에 못 닿으면 저장된 정보로 계속
      }
      if (cancelled) return
      if (!fresh) {
        setUser(null)
        return
      }
      if (fresh.role !== user.role) {
        setUser(fresh)
        return
      }
      const code = getPendingJoin()
      if (code) {
        try {
          const res = await joinFamily(code)
          toast(`${res.groupName}의 약을 볼 수 있게 됐어요.`, 'success')
        } catch (e) {
          toast(friendlyError(e), 'error')
        }
        clearPendingJoin()
        if (!cancelled) setPending(null)
      }
      if (!cancelled) await load()
    })()
    return () => {
      cancelled = true
    }
    // 계정이 바뀌거나 역할이 바뀔 때만 다시 돈다(user 객체 전체가 아니라 id·role만 본다)
  }, [user?.id, user?.role, load, toast])

  const isAdmin = user?.role === 'admin'

  async function removeMember(m: FamilyMemberView) {
    const ok = await confirm({
      title: `${m.displayName}을(를) 그룹에서 뺄까요?`,
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

  function openInvite(groupId: string, role: FamilyRole) {
    setInvite(null)
    setCreatingGroup(false)
    setInviteForm({ groupId, role })
  }

  async function handleSignOut() {
    await signOut()
    disableGoogleAutoSelect()
    setUser(null)
    setInvite(null)
    setInviteForm(null)
    toast('로그아웃했어요.', 'success')
  }

  function cancelPending() {
    clearPendingJoin()
    setPending(null)
  }

  // ---------- 로그인 전 ----------
  if (!user) {
    return (
      <>
        <header className="screen-head">
          <h1 className="screen-head__title">가족</h1>
          <p className="screen-head__desc">가족이 등록한 약과 영양제를 함께 볼 수 있어요.</p>
        </header>
        <div className="group family-login">
          <div className="family-login__icon" aria-hidden="true">
            <Users />
          </div>
          <p className="family-login__title">
            {pendingInfo ? `${pendingInfo.groupName}의 약을 보려면 로그인해 주세요` : 'Google로 로그인해서 써요'}
          </p>
          <p className="family-login__desc">
            {pendingInfo
              ? `'${pendingInfo.displayName}'(으)로 연결돼요. 처음 한 번만 로그인하면 돼요.`
              : '가족 그룹을 관리하거나, 가족의 약을 함께 보는 분이 쓰는 화면이에요. 약을 등록하시는 분은 로그인하지 않아도 돼요.'}
          </p>
          <GoogleSignInButton onSignedIn={(u) => setUser(u)} />
        </div>
        {pending && (
          <div className="block-actions">
            <button type="button" className="btn btn--plain" onClick={cancelPending}>
              연결 그만두기
            </button>
          </div>
        )}
      </>
    )
  }

  // ---------- 로그인 후 ----------
  const noGroups = groups !== null && groups.length === 0

  return (
    <>
      <header className="screen-head family-head">
        <div className="family-head__text">
          <h1 className="screen-head__title">가족</h1>
          <p className="screen-head__desc">
            {isAdmin
              ? '가족 그룹을 만들고 초대해요. 가족이 등록한 약이 여기 보여요.'
              : '가족이 등록한 약과 영양제예요.'}
          </p>
        </div>
        <button
          type="button"
          className="family-head__refresh"
          onClick={() => void load()}
          disabled={loading}
          aria-label="새로 고침"
        >
          <RefreshCw className={loading ? 'is-spinning' : undefined} />
        </button>
      </header>

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

      {/* 처음: 그룹이 없을 때 */}
      {noGroups && isAdmin && !creatingGroup && (
        <>
          <div className="group empty-box">
            <p className="empty-box__title">세 단계면 시작할 수 있어요</p>
            <ol className="steps">
              <li>
                <b>그룹</b>을 만들어요. 집마다 하나씩이면 돼요.
              </li>
              <li>
                <b>가족을 초대</b>해요. 초대 코드를 카톡으로 보내면, 받은 분이 앱에 넣어요.
              </li>
              <li>
                가족이 등록한 <b>약이 여기 보여요</b>.
              </li>
            </ol>
          </div>
          <div className="block-actions">
            <button type="button" className="btn btn--primary" onClick={() => setCreatingGroup(true)}>
              <Plus aria-hidden="true" /> 그룹 만들기
            </button>
          </div>
        </>
      )}
      {noGroups && !isAdmin && (
        <div className="group empty-box">
          <p className="empty-box__title">아직 연결된 가족이 없어요</p>
          <p className="family-empty__desc">관리자에게 함께 볼 가족 초대를 받아 주세요.</p>
        </div>
      )}

      {groups?.map((g) => {
        const empty = g.members.length === 0 && g.viewers.length === 0
        return (
          <section key={g.id} className="family-group" aria-label={g.name}>
            <h2 className="group-label">{g.name}</h2>

            <ul className="group">
              {empty && (
                <li>
                  <div className="row family-row--top">
                    <span className="row__icon" aria-hidden="true">
                      <Users />
                    </span>
                    <span className="row__body">
                      <span className="row__title">아직 초대한 가족이 없어요</span>
                      <span className="row__sub row__sub--guide">
                        {isAdmin ? '아래에서 초대 코드를 만들어 보내 주세요.' : '관리자가 초대하면 여기 보여요.'}
                      </span>
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
                        {ROLE_TEXT.member}
                        {' · '}
                        {m.connected ? `마지막 사용 ${lastSeenText(m.lastSeenAt)}` : '새 휴대폰 연결을 기다리는 중'}
                      </div>
                    </div>
                  </div>
                  {m.meds.length === 0 ? (
                    <p className="family-meds__empty">등록한 약이 아직 없어요.</p>
                  ) : (
                    <ul className="family-meds" aria-label={`${m.displayName}의 약 ${m.meds.length}개`}>
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
                  {isAdmin && (
                    <div className="family-member__actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => void relinkMember(g.id, m)}
                        aria-label={`${m.displayName} 폰 바꿨을 때 다시 연결`}
                      >
                        폰 바꿨을 때 다시 연결
                      </button>
                      <button
                        type="button"
                        className="text-btn text-btn--danger"
                        onClick={() => void removeMember(m)}
                        aria-label={`${m.displayName} 빼기`}
                      >
                        빼기
                      </button>
                    </div>
                  )}
                </li>
              ))}

              {g.viewers.map((v) => (
                <li key={v.id}>
                  <div className="row">
                    <span className="row__icon" aria-hidden="true">
                      <Eye />
                    </span>
                    <div className="row__body">
                      <div className="row__title">{v.displayName}</div>
                      <div className="row__sub">{ROLE_TEXT.viewer}</div>
                      {isAdmin && v.accountEmail && <div className="row__sub family-email">{v.accountEmail}</div>}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        className="text-btn text-btn--danger"
                        onClick={() => void removeMember(v)}
                        aria-label={`${v.displayName} 빼기`}
                      >
                        빼기
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {isAdmin &&
              (invite?.groupId === g.id ? (
                <InviteResult invite={invite.data} onClose={() => setInvite(null)} />
              ) : inviteForm?.groupId === g.id ? (
                <InviteForm
                  groupId={g.id}
                  groupName={g.name}
                  role={inviteForm.role}
                  onCancel={() => setInviteForm(null)}
                  onCreated={(data) => {
                    setInviteForm(null)
                    setInvite({ groupId: g.id, data })
                    void load()
                  }}
                />
              ) : (
                <ul className="group family-invite-rows" aria-label={`${g.name}에 초대하기`}>
                  <li>
                    <button type="button" className="row" onClick={() => openInvite(g.id, 'member')}>
                      <span className="row__icon" aria-hidden="true">
                        <UserPlus />
                      </span>
                      <span className="row__body">
                        <span className="row__title">약 드시는 분 초대</span>
                        <span className="row__sub">부모님처럼 약을 등록하는 분. 로그인&nbsp;없이 코드만&nbsp;넣어요.</span>
                      </span>
                      <ChevronRight className="row__chev" aria-hidden="true" />
                    </button>
                  </li>
                  <li>
                    <button type="button" className="row" onClick={() => openInvite(g.id, 'viewer')}>
                      <span className="row__icon" aria-hidden="true">
                        <Eye />
                      </span>
                      <span className="row__body">
                        <span className="row__title">함께 볼 가족 초대</span>
                        <span className="row__sub">이 그룹의 약을 같이 볼 분. Google&nbsp;로그인이&nbsp;필요해요.</span>
                      </span>
                      <ChevronRight className="row__chev" aria-hidden="true" />
                    </button>
                  </li>
                </ul>
              ))}
          </section>
        )
      })}

      {isAdmin &&
        (creatingGroup ? (
          <NewGroupForm
            onCancel={() => setCreatingGroup(false)}
            onCreated={() => {
              setCreatingGroup(false)
              void load()
            }}
          />
        ) : (
          groups &&
          groups.length > 0 && (
            <div className="block-actions">
              <button
                type="button"
                className="btn btn--plain"
                onClick={() => {
                  setInviteForm(null)
                  setInvite(null)
                  setCreatingGroup(true)
                }}
              >
                <Plus aria-hidden="true" /> 그룹 더 만들기
              </button>
            </div>
          )
        ))}

      {isAdmin && <AdminUsers currentUserId={user.id} />}

      <h2 className="group-label">내 계정</h2>
      <div className="group">
        <div className="row">
          <span className="row__icon" aria-hidden="true">
            <User />
          </span>
          <div className="row__body">
            <div className="row__title">
              {user.name ?? user.email ?? 'Google 계정'}{' '}
              <span className={`tag ${isAdmin ? 'tag--primary' : ''}`}>{isAdmin ? '관리자' : ROLE_TEXT.viewer}</span>
            </div>
            {user.email && <div className="row__sub family-email">{user.email}</div>}
          </div>
          <button type="button" className="text-btn" onClick={() => void handleSignOut()}>
            로그아웃
          </button>
        </div>
      </div>
    </>
  )
}
