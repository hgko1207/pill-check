import { useEffect, useState } from 'react'
import { loadTheme, saveTheme, type Theme } from '../lib/theme'

const FONT_KEY = 'pillcheck.fontScale'
type FontScale = 'normal' | 'large'

function applyFontScale(scale: FontScale) {
  if (scale === 'large') {
    document.documentElement.setAttribute('data-font-scale', 'large')
  } else {
    document.documentElement.removeAttribute('data-font-scale')
  }
}

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>('light')
  const [fontScale, setFontScale] = useState<FontScale>('normal')

  useEffect(() => {
    setTheme(loadTheme())
    const savedFont = (localStorage.getItem(FONT_KEY) as FontScale | null) ?? 'normal'
    setFontScale(savedFont)
  }, [])

  const chooseTheme = (next: Theme) => {
    setTheme(next)
    saveTheme(next)
  }

  const chooseFont = (next: FontScale) => {
    setFontScale(next)
    applyFontScale(next)
    localStorage.setItem(FONT_KEY, next)
  }

  return (
    <section className="page">
      <h2 className="page__title">⚙️ 설정</h2>

      <div className="settings-section-title">표시</div>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row__label">글자 크기</div>
            <div className="settings-row__hint">눈이 편하신 크기로 조정하세요</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="글자 크기">
            <button
              className={`segmented__btn ${fontScale === 'normal' ? 'segmented__btn--active' : ''}`}
              onClick={() => chooseFont('normal')}
              role="radio"
              aria-checked={fontScale === 'normal'}
            >
              보통
            </button>
            <button
              className={`segmented__btn ${fontScale === 'large' ? 'segmented__btn--active' : ''}`}
              onClick={() => chooseFont('large')}
              role="radio"
              aria-checked={fontScale === 'large'}
            >
              크게
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">테마</div>
            <div className="settings-row__hint">밝게 / 어둡게 / 기기 설정 따라가기</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="테마">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                className={`segmented__btn ${theme === t ? 'segmented__btn--active' : ''}`}
                onClick={() => chooseTheme(t)}
                role="radio"
                aria-checked={theme === t}
              >
                {t === 'light' ? '밝게' : t === 'dark' ? '어둡게' : '자동'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section-title">앱 정보</div>
      <div className="settings-info">
        <p>
          <b>PillCheck</b> — 약·영양제 상호작용 체크 (V1.6)
        </p>
        <p style={{ marginTop: 8 }}>
          식품의약품안전처 공공데이터(의약품 제품 허가정보 + DUR 품목정보)와
          식품안전나라 건강기능식품 정보를 결합하여 부모님 처방약과 새 영양제·일반약의
          상호작용을 확인합니다.
        </p>
        <p style={{ marginTop: 8 }}>
          소스 코드:{' '}
          <a href="https://github.com/hgko1207/pill-check" target="_blank" rel="noreferrer">
            github.com/hgko1207/pill-check
          </a>
        </p>
      </div>

      <div className="settings-section-title">면책</div>
      <div className="settings-info">
        본 정보는 식품의약품안전처 공공데이터를 기반으로 한 <b>참고용 자료</b>입니다.
        의료 행위가 아니며, 약사·의사 상담을 대체하지 않습니다. 실제 복용 결정은
        반드시 전문가와 상의하세요.
      </div>
    </section>
  )
}
