import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pillcheck.fontScale'
type Scale = 'normal' | 'large'

function applyScale(scale: Scale) {
  if (scale === 'large') {
    document.documentElement.setAttribute('data-font-scale', 'large')
  } else {
    document.documentElement.removeAttribute('data-font-scale')
  }
}

export function FontToggle() {
  const [scale, setScale] = useState<Scale>('normal')

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Scale | null) ?? 'normal'
    setScale(saved)
    applyScale(saved)
  }, [])

  const choose = (next: Scale) => {
    setScale(next)
    applyScale(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <div className="font-toggle" role="radiogroup" aria-label="글자 크기">
      <span>글자 크기</span>
      <button
        className={`font-toggle__btn ${scale === 'normal' ? 'font-toggle__btn--active' : ''}`}
        onClick={() => choose('normal')}
        role="radio"
        aria-checked={scale === 'normal'}
      >
        보통
      </button>
      <button
        className={`font-toggle__btn ${scale === 'large' ? 'font-toggle__btn--active' : ''}`}
        onClick={() => choose('large')}
        role="radio"
        aria-checked={scale === 'large'}
      >
        크게
      </button>
    </div>
  )
}
