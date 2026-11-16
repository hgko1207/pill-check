import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ChevronRight, Eye, LogOut, Plus, RefreshCw, Settings2, User, UserPlus, Users } from 'lucide-react'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import { disableGoogleAutoSelect } from '../lib/auth'
import { findConflictsAmong, type AmongResult } from '../lib/dur'
import {
  clearPendingJoin,
  getFamilyView,
  getPendingJoin,
  getSessionUser,
  joinFamily,
  leaveGroup,
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
import { InviteForm, InviteResult, NewGroupForm, ROLE_TEXT, keepHyphen } from './FamilyAdmin'
import { GoogleSignInButton } from './GoogleSignInButton'
import { GroupManageSheet } from './GroupManageSheet'

const SELECTED_KEY = 'pillcheck.familyGroup'

/** "3일 전" 같은 마지막 사용 시각 */
function lastSeenText(at: number | null): string {
  if (!at) return '아직 쓰지 않음'
  const min = Math.floor((Date.now() - at) / 60000)
  if (min < 60) return '방금 전'
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function initial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}

/** 함께 보는 가족에게 "누구에게 부탁하면 되는지" 보여 줄 그룹 관리자 이름 */
function managerNames(g: FamilyGroupView): string {
  return g.viewers
    .filter((v) => v.isManager && !v.isMe)
    .map((v) => v.displayName)
    .join(', ')
}

/** 약 목록이 바뀌면 다시 대조하도록 키에 갱신 시각을 넣는다 */
function durKey(m: FamilyMemberView): string {
  return `${m.id}:${m.medsUpdatedAt ?? 0}`
}

/** "노바스크정5밀리그램(암로디핀베실산염)" → "노바스크정5밀리그램" */
function shortMedName(name: string): string {
  return name.replace(/\([^)]*\)/g, '').trim() || name
}

/** 이름 뒤 '와'/'과' (받침 있으면 '과'). 한글로 끝나지 않으면 '+' */
function andParticle(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00
  if (code < 0 || code > 11171) return ' +'
  return code % 28 === 0 ? '와' : '과'
}

/** 약 드시는 분 카드 안: 그분 약끼리 병용금기 (plan.md 56). 충돌이 없으면 아무것도 띄우지 않는다 */
function MemberDurNotice({ result }: { result: AmongResult | undefined }) {
  if (!result) return null
  const { conflicts, unchecked } = result
  return (
    <>
      {conflicts.length > 0 && (
        <div className="family-dur family-dur--danger" role="note">
          <AlertCircle aria-hidden="true" />
          <div>
            <b>함께 드시면 안 되는 약이 있어요</b>
            <ul className="family-dur__pairs">
              {conflicts.map((c) => (
                <li key={`${c.aKey}|${c.bKey}`}>
                  {shortMedName(c.aName)}
                  {andParticle(shortMedName(c.aName))} {shortMedName(c.bName)}
                </li>
              ))}
            </ul>
            <span className="family-dur__next">식약처 자료 기준 참고용이에요. 약사에게 물어봐 주세요.</span>
          </div>
        </div>
      )}
      {unchecked > 0 && (
        <div className="family-dur family-dur--unknown" role="note">
          <AlertCircle aria-hidden="true" />
          <span>일부 약은 함께 드셔도 되는지 확인하지 못했어요. 새로 고침해 다시 확인해 주세요.</span>
        </div>
      )}
    </>
  )
}

function loadSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

function saveSelected(id: string): void {
  try {
    localStorage.setItem(SELECTED_KEY, id)
  } catch {
    /* 무시 */
  }
}

/**
 * 가족 탭 (plan.md 52, 시안 ③ "그룹 칩 + 한 그룹씩")
 * 위쪽 칩으로 그룹을 고르면 그 그룹의 "누가 무슨 약을 드시나"가 바로 보인다.
 * 초대·그룹 관리는 내가 관리자인 그룹에만, 함께 보는 가족으로만 속한 그룹에는 "그룹 나가기"만.
 */
export function FamilyPage() {
  const { confirm, toast } = useDialog()
  const [user, setUser] = useState<AuthUser | null>(() => getSessionUser())
  const [pending, setPending] = useState<string | null>(() => getPendingJoin())
  const [pendingInfo, setPendingInfo] = useState<InvitePreview | null>(null)
  const [groups, setGroups] = useState<FamilyGroupView[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => loadSelected())
  const [slide, setSlide] = useState<'left' | 'right' | null>(null)
  const [creating, setCreating] = useState(false)
  const [inviteRole, setInviteRole] = useState<FamilyRole | null>(null)
  const [invite, setInvite] = useState<CreatedInvite | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  // 약 드시는 분별 약끼리 대조 결과 (키: durKey)
  const [durResults, setDurResults] = useState<Record<string, AmongResult>>({})

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

  // 로그인돼 있으면: 계정을 서버와 맞추고 → 들고 있던 초대를 잇고 → 그룹을 불러온다
  useEffect(() => {
    if (!user) {
      setGroups(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const fresh = await refreshSessionUser()
        if (cancelled) return
        if (!fresh) {
          setUser(null)
          return
        }
      } catch {
        // 서버에 못 닿으면 저장된 정보로 계속
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
  }, [user?.id, load, toast])

  const selected = groups?.find((g) => g.id === selectedId) ?? groups?.[0] ?? null

  // 고른 그룹의 약 드시는 분마다 약끼리 병용금기를 대조한다 (자료는 품목별 24시간 캐시)
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    for (const m of selected.members) {
      if (m.meds.length < 2) continue
      const key = durKey(m)
      findConflictsAmong(m.meds)
        .then((r) => {
          if (!cancelled) setDurResults((prev) => ({ ...prev, [key]: r }))
        })
        .catch(() => {
          // 대조 자체가 실패하면 표시하지 않는다(초록으로 단정하지 않으므로 빈칸이 안전하다)
        })
    }
    return () => {
      cancelled = true
    }
  }, [selected])

  function resetPanels() {
    setCreating(false)
    setInviteRole(null)
    setInvite(null)
  }

  function selectGroup(id: string) {
    if (!groups || id === selected?.id) return
    const from = groups.findIndex((g) => g.id === selected?.id)
    const to = groups.findIndex((g) => g.id === id)
    setSlide(to > from ? 'right' : 'left')
    setSelectedId(id)
    saveSelected(id)
    resetPanels()
  }

  async function handleLeave(g: FamilyGroupView) {
    const ok = await confirm({
      title: `${g.name}에서 나갈까요?`,
      message: <>이 그룹 가족의 약을 더 이상 볼 수 없어요. 다시 보려면 관리자에게 초대를 받아야&nbsp;해요.</>,
      confirmLabel: '나가기',
      cancelLabel: '취소',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await leaveGroup(g.id)
      toast(`${g.name}에서 나왔어요.`, 'success')
      setSelectedId(null)
      void load()
    } catch (e) {
      toast(friendlyError(e), 'error')
    }
  }

  async function handleSignOut() {
    await signOut()
    disableGoogleAutoSelect()
    setUser(null)
    resetPanels()
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
              ? `'${pendingInfo.displayName}' 이름으로 연결돼요. 처음 한 번만 로그인하면 돼요.`
              : '가족 그룹을 만들거나 가족의 약을 함께 볼 때 써요. 약을 등록하시는 분은 로그인하지 않아도 돼요.'}
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
          <p className="screen-head__desc">가족이 등록한 약과 영양제예요.</p>
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

      {/* 처음: 속한 그룹이 없을 때 */}
      {noGroups && !creating && (
        <>
          <div className="group empty-box">
            <p className="empty-box__title">세 단계면 시작할 수 있어요</p>
            <ol className="steps">
              <li>
                <b>그룹</b>을 만들어요. 만든 분이 그 그룹의 관리자가&nbsp;돼요.
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
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> 그룹 만들기
            </button>
          </div>
          <p className="family-note">초대 링크를 받으셨나요? 그 링크를 열면 바로 연결돼요.</p>
        </>
      )}

      {/* 그룹 칩 */}
      {groups && groups.length > 0 && (
        <div className="family-chips" role="group" aria-label="가족 그룹 고르기">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip family-chip"
              aria-pressed={g.id === selected?.id}
              onClick={() => selectGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
          <button
            type="button"
            className="chip family-chip family-chip--add"
            onClick={() => {
              resetPanels()
              setCreating(true)
            }}
          >
            <Plus aria-hidden="true" /> 새 그룹
          </button>
        </div>
      )}

      {creating && (
        <NewGroupForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSelectedId(id)
            saveSelected(id)
            void load()
          }}
        />
      )}

      {/* 고른 그룹 하나 */}
      {selected && !creating && (
        <section
          key={selected.id}
          className={`family-group${slide ? ` family-group--from-${slide}` : ''}`}
          aria-label={selected.name}
        >
          <p className="family-role">
            {selected.isManager ? (
              <>
                내가 관리하는 그룹 <span className="tag tag--primary">관리자</span>
              </>
            ) : (
              <>
                함께 보는 그룹
                {managerNames(selected) && <span className="family-role__who">관리자 {managerNames(selected)}</span>}
              </>
            )}
          </p>

          <ul className="group">
            {selected.members.length === 0 && (
              <li>
                <div className="row family-row--top">
                  <span className="row__icon" aria-hidden="true">
                    <Users />
                  </span>
                  <span className="row__body">
                    <span className="row__title">아직 약 드시는 분이 없어요</span>
                    <span className="row__sub row__sub--guide">
                      {selected.isManager
                        ? "아래 '약 드시는 분 초대'로 시작해 보세요."
                        : '그룹 관리자가 초대하면 여기 보여요.'}
                    </span>
                  </span>
                </div>
              </li>
            )}

            {selected.members.map((m) => (
              <li key={m.id} className="family-member">
                <div className="row family-member__head">
                  <span className="row__icon family-initial" aria-hidden="true">
                    {initial(m.displayName)}
                  </span>
                  <div className="row__body">
                    <div className="row__title">{m.displayName}</div>
                    <div className="row__sub">
                      {!m.connected
                        ? `${ROLE_TEXT.member}, 새 휴대폰 연결을 기다리는 중`
                        : m.lastSeenAt
                          ? `${ROLE_TEXT.member}, ${lastSeenText(m.lastSeenAt)} 사용`
                          : `${ROLE_TEXT.member}, 아직 쓰지 않음`}
                    </div>
                  </div>
                </div>
                <MemberDurNotice result={durResults[durKey(m)]} />
                {m.meds.length === 0 ? (
                  <p className="family-meds__empty">등록한 약이 아직 없어요.</p>
                ) : (
                  <ul className="family-meds" aria-label={`${m.displayName}의 약 ${m.meds.length}개`}>
                    {m.meds.map((med) => (
                      <li key={med.itemSeq} className="family-meds__item">
                        <span className="family-meds__name">
                          {med.itemName}
                          {durResults[durKey(m)]?.conflicts.some(
                            (c) => c.aKey === `${med.kind}:${med.itemSeq}` || c.bKey === `${med.kind}:${med.itemSeq}`,
                          ) && <span className="status status--danger family-meds__flag">확인 필요</span>}
                        </span>
                        <span className={`tag ${med.kind === 'healthfood' ? '' : 'tag--primary'}`}>
                          {med.kind === 'healthfood' ? '영양제' : '의약품'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}

            {selected.viewers.map((v) => (
              <li key={v.id}>
                <div className="row">
                  <span className="row__icon" aria-hidden="true">
                    <Eye />
                  </span>
                  <div className="row__body">
                    <div className="row__title">
                      {v.displayName}
                      {v.isMe && <span className="family-me"> (나)</span>}
                    </div>
                    <div className="row__sub">{v.isManager ? '관리자' : ROLE_TEXT.viewer}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {selected.isManager ? (
            inviteRole ? (
              <InviteForm
                groupId={selected.id}
                groupName={selected.name}
                role={inviteRole}
                onCancel={() => setInviteRole(null)}
                onCreated={(data) => {
                  setInviteRole(null)
                  setInvite(data)
                  void load()
                }}
              />
            ) : invite ? (
              <InviteResult invite={invite} onClose={() => setInvite(null)} />
            ) : (
              <ul className="group family-actions-list" aria-label={`${selected.name} 관리`}>
                <li>
                  <button type="button" className="row" onClick={() => setInviteRole('member')}>
                    <span className="row__icon" aria-hidden="true">
                      <UserPlus />
                    </span>
                    <span className="row__body">
                      <span className="row__title">약 드시는 분 초대</span>
                      <span className="row__sub">로그인&nbsp;없이 코드로&nbsp;연결</span>
                    </span>
                    <ChevronRight className="row__chev" aria-hidden="true" />
                  </button>
                </li>
                <li>
                  <button type="button" className="row" onClick={() => setInviteRole('viewer')}>
                    <span className="row__icon" aria-hidden="true">
                      <Eye />
                    </span>
                    <span className="row__body">
                      <span className="row__title">함께 볼 가족 초대</span>
                      <span className="row__sub">Google&nbsp;로그인&nbsp;필요</span>
                    </span>
                    <ChevronRight className="row__chev" aria-hidden="true" />
                  </button>
                </li>
                <li>
                  <button type="button" className="row" onClick={() => setManageOpen(true)}>
                    <span className="row__icon" aria-hidden="true">
                      <Settings2 />
                    </span>
                    <span className="row__body">
                      <span className="row__title">그룹 관리</span>
                    </span>
                    <ChevronRight className="row__chev" aria-hidden="true" />
                  </button>
                </li>
              </ul>
            )
          ) : (
            <ul className="group family-actions-list">
              <li>
                <button type="button" className="row" onClick={() => void handleLeave(selected)}>
                  <span className="row__icon" aria-hidden="true">
                    <LogOut />
                  </span>
                  <span className="row__body">
                    <span className="row__title">그룹 나가기</span>
                  </span>
                </button>
              </li>
            </ul>
          )}
        </section>
      )}

      <h2 className="group-label">내 계정</h2>
      <ul className="group">
        <li>
          <div className="row">
            <span className="row__icon" aria-hidden="true">
              <User />
            </span>
            <div className="row__body">
              <div className="row__title">{user.name ?? user.email ?? 'Google 계정'}</div>
              {user.email && <div className="row__sub family-email">{keepHyphen(user.email)}</div>}
            </div>
          </div>
        </li>
        <li>
          <button type="button" className="row" onClick={() => void handleSignOut()}>
            <span className="row__icon" aria-hidden="true">
              <LogOut />
            </span>
            <span className="row__body">
              <span className="row__title">로그아웃</span>
            </span>
          </button>
        </li>
      </ul>

      <GroupManageSheet
        open={manageOpen}
        group={selected}
        onClose={() => setManageOpen(false)}
        onChanged={() => void load()}
        onGone={() => {
          setManageOpen(false)
          setSelectedId(null)
          void load()
        }}
      />
    </>
  )
}
