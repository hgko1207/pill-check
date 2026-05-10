/**
 * Theme system: light / dark / system.
 * - localStorage 영구 저장
 * - "system"이면 prefers-color-scheme 자동 감지 + 변경 추적
 */

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'pillcheck.theme'

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyEffectiveTheme(theme: Theme) {
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  if (effective === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export function loadTheme(): Theme {
  const v = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Theme | null
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'light' // 60대 친화 기본값
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme)
  applyEffectiveTheme(theme)
}

/** 앱 시작 시 1회 호출 — 저장된 테마를 즉시 적용 + system 변경 추적 등록. */
export function initTheme(): Theme {
  const theme = loadTheme()
  applyEffectiveTheme(theme)
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', () => {
      if (loadTheme() === 'system') applyEffectiveTheme('system')
    })
  }
  return theme
}
