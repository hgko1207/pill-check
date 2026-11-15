/**
 * Google 로그인 버튼 (Google Identity Services, plan.md 46)
 *
 * 스크립트(https://accounts.google.com/gsi/client)는 로그인 화면이 필요할 때만 불러온다 —
 * 부모님 기기에는 로그인 화면이 없으므로 불러오지 않는다.
 * 버튼을 누르면 Google 팝업에서 계정을 고르고, 콜백으로 ID 토큰(credential)을 받는다.
 * 받은 토큰을 서버에 보내 세션으로 바꾸는 일은 family.ts의 signInWithGoogle이 한다.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const LOAD_TIMEOUT_MS = 10_000

interface GoogleIdApi {
  initialize(config: {
    client_id: string
    callback: (res: { credential?: string }) => void
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      logo_alignment?: 'left' | 'center'
      width?: number
      locale?: string
    },
  ): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } }
  }
}

export class GoogleSignInError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleSignInError'
  }
}

let loading: Promise<GoogleIdApi> | null = null

function loadGis(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id
  if (ready) return Promise.resolve(ready)
  if (loading) return loading
  loading = new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    const timer = setTimeout(() => reject(new GoogleSignInError('Google 스크립트 시간 초과')), LOAD_TIMEOUT_MS)
    script.onload = () => {
      clearTimeout(timer)
      const api = window.google?.accounts?.id
      if (api) resolve(api)
      else reject(new GoogleSignInError('Google 스크립트에 로그인 기능이 없음'))
    }
    script.onerror = () => {
      clearTimeout(timer)
      reject(new GoogleSignInError('Google 스크립트를 불러오지 못함'))
    }
    document.head.appendChild(script)
  })
  // 실패하면 다음에 다시 시도할 수 있게
  loading.catch(() => {
    loading = null
  })
  return loading
}

let initializedFor: string | null = null
let currentHandler: ((credential: string) => void) | null = null

/** el 안에 Google 로그인 버튼을 그린다. 계정을 고르면 onCredential(ID 토큰)이 불린다 */
export async function renderGoogleButton(
  el: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<void> {
  const api = await loadGis()
  currentHandler = onCredential
  // initialize는 클라이언트 ID마다 한 번만. 콜백은 지금 화면의 것으로 바꿔 끼운다
  if (initializedFor !== clientId) {
    api.initialize({
      client_id: clientId,
      callback: (res) => {
        if (res.credential) currentHandler?.(res.credential)
      },
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
    })
    initializedFor = clientId
  }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  el.innerHTML = ''
  api.renderButton(el, {
    type: 'standard',
    theme: dark ? 'filled_black' : 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: Math.min(400, Math.max(200, Math.floor(el.clientWidth || 300))),
    locale: 'ko',
  })
}

/** 로그아웃 뒤 같은 계정으로 저절로 다시 들어가지 않게 */
export function disableGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect()
}
