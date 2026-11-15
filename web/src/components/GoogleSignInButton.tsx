import { useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useDialog } from '../lib/dialog'
import { friendlyError } from '../lib/errors'
import { renderGoogleButton } from '../lib/auth'
import { getGoogleClientId, signInWithGoogle, type AuthUser } from '../lib/family'

interface Props {
  onSignedIn: (user: AuthUser) => void
}

/** Google 로그인 버튼 (plan.md 46). 버튼 모양은 Google이 그린다 */
export function GoogleSignInButton({ onSignedIn }: Props) {
  const { toast } = useDialog()
  const holder = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'busy' | 'error'>('loading')
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  // 콜백이 바뀌어도 버튼을 다시 그리지 않게 최신 값만 들고 있는다
  const onSignedInRef = useRef(onSignedIn)
  onSignedInRef.current = onSignedIn

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    ;(async () => {
      try {
        const clientId = await getGoogleClientId()
        if (cancelled || !holder.current) return
        await renderGoogleButton(holder.current, clientId, async (credential) => {
          setState('busy')
          try {
            const user = await signInWithGoogle(credential)
            onSignedInRef.current(user)
          } catch (e) {
            toast(friendlyError(e), 'error')
            setState('ready')
          }
        })
        if (!cancelled) setState('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e)
          setState('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attempt, toast])

  return (
    <div className="google-signin">
      <div ref={holder} className="google-signin__button" hidden={state === 'error' || state === 'busy'} />
      {state === 'loading' && (
        <p className="loading-line">
          <span className="spinner" aria-hidden="true" /> 로그인 버튼을 불러오는 중
        </p>
      )}
      {state === 'busy' && (
        <p className="loading-line">
          <span className="spinner" aria-hidden="true" /> 로그인하는 중
        </p>
      )}
      {state === 'error' && (
        <>
          <div className="notice notice--error" role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{friendlyError(error)}</span>
          </div>
          <button type="button" className="btn btn--plain google-signin__retry" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </button>
        </>
      )}
    </div>
  )
}
