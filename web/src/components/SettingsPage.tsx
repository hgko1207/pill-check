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

      <div className="settings-section-title">화면</div>
      <div className="settings-group">
        <SettingsRow
          icon="🔤"
          label="글자 크기"
          hint="눈이 편하신 크기로 조정하세요"
        >
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
        </SettingsRow>

        <SettingsRow
          icon="🎨"
          label="테마"
          hint="밝게 / 어둡게 / 기기 설정 따라가기"
        >
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
        </SettingsRow>
      </div>

      <div className="settings-section-title">데이터 출처</div>
      <div className="settings-group">
        <InfoRow
          icon="🏛️"
          title="식품의약품안전처 공공데이터"
          desc="의약품 제품 허가정보 + DUR 품목정보(병용금기 81만건)"
          link="https://www.data.go.kr/data/15095677/openapi.do"
        />
        <InfoRow
          icon="🌿"
          title="식품안전나라"
          desc="건강기능식품 품목제조 신고사항 (영양제)"
          link="https://www.foodsafetykorea.go.kr/api"
        />
      </div>

      <div className="settings-section-title">앱 정보</div>
      <div className="settings-group">
        <InfoRow
          icon="ℹ️"
          title="버전"
          desc="V1.6 — 앱 셸 + 다크 모드"
        />
        <InfoRow
          icon="🔗"
          title="소스 코드 (오픈소스)"
          desc="github.com/hgko1207/pill-check"
          link="https://github.com/hgko1207/pill-check"
        />
        <InfoRow
          icon="📖"
          title="설계 문서"
          desc="DESIGN.md — 결정 근거·우선순위"
          link="https://github.com/hgko1207/pill-check/blob/main/DESIGN.md"
        />
      </div>

      <div className="settings-section-title">⚠️ 면책</div>
      <div className="settings-warn">
        본 정보는 식품의약품안전처 공공데이터를 기반으로 한 <b>참고용 자료</b>입니다.
        <br />
        의료 행위가 아니며, 약사·의사 상담을 대체하지 않습니다.
        <br />
        실제 복용 결정은 반드시 전문가와 상의하세요.
      </div>
    </section>
  )
}

function SettingsRow({
  icon,
  label,
  hint,
  children,
}: {
  icon: string
  label: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__main">
        <div className="settings-row__icon" aria-hidden="true">{icon}</div>
        <div>
          <div className="settings-row__label">{label}</div>
          {hint && <div className="settings-row__hint">{hint}</div>}
        </div>
      </div>
      {children && <div className="settings-row__control">{children}</div>}
    </div>
  )
}

function InfoRow({
  icon,
  title,
  desc,
  link,
}: {
  icon: string
  title: string
  desc: string
  link?: string
}) {
  const content = (
    <div className="settings-row">
      <div className="settings-row__main">
        <div className="settings-row__icon" aria-hidden="true">{icon}</div>
        <div>
          <div className="settings-row__label">{title}</div>
          <div className="settings-row__hint">{desc}</div>
        </div>
      </div>
      {link && <span className="settings-row__chev" aria-hidden="true">›</span>}
    </div>
  )
  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="settings-row-link"
      >
        {content}
      </a>
    )
  }
  return content
}
