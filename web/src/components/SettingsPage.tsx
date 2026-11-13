import { useEffect, useState } from 'react'
import { loadTheme, saveTheme, type Theme } from '../lib/theme'
import { clearAllMedications, listMedications } from '../lib/db'
import { useDialog } from '../lib/dialog'
import { BookOpen, ChevronRight, Trash2 } from 'lucide-react'

const FONT_KEY = 'pillcheck.fontScale'
type FontScale = 'normal' | 'large'

function applyFontScale(scale: FontScale) {
  if (scale === 'large') {
    document.documentElement.setAttribute('data-font-scale', 'large')
  } else {
    document.documentElement.removeAttribute('data-font-scale')
  }
}

interface SettingsProps {
  onShowGuide?: () => void
  onMedicationsChanged?: () => void
}

export function SettingsPage({ onShowGuide, onMedicationsChanged }: SettingsProps = {}) {
  const [clearing, setClearing] = useState(false)
  const { confirm, toast } = useDialog()

  async function handleClearAll() {
    setClearing(true)
    try {
      const list = await listMedications()
      if (list.length === 0) {
        toast('등록한 약이 없어요.', 'info')
        return
      }
      const ok = await confirm({
        title: '등록한 약을 모두 지울까요?',
        message: (
          <>
            등록한 약 <b>{list.length}개</b>를 모두 지워요. 지운 뒤에는 되돌릴 수&nbsp;없어요.
          </>
        ),
        confirmLabel: '모두 지우기',
        cancelLabel: '취소',
        variant: 'danger',
      })
      if (!ok) return
      const removed = await clearAllMedications()
      onMedicationsChanged?.()
      toast(`약 ${removed}개를 모두 지웠어요.`, 'success')
    } finally {
      setClearing(false)
    }
  }

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
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">설정</h1>
      </header>

      <h2 className="group-label">화면</h2>
      <div className="group">
        <div className="setting">
          <div className="setting__text">
            <div className="row__title" id="font-label">글자 크기</div>
            <div className="row__sub row__sub--guide">눈이 편한 크기로 골라 주세요.</div>
          </div>
          <div className="segmented" role="radiogroup" aria-labelledby="font-label">
            {(['normal', 'large'] as FontScale[]).map((f) => (
              <button
                key={f}
                type="button"
                className="segmented__btn"
                onClick={() => chooseFont(f)}
                role="radio"
                aria-checked={fontScale === f}
              >
                {f === 'normal' ? '보통' : '크게'}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div className="setting__text">
            <div className="row__title" id="theme-label">화면 색</div>
            <div className="row__sub row__sub--guide">자동은 휴대폰 설정을 따라가요.</div>
          </div>
          <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                className="segmented__btn"
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

      <h2 className="group-label">도움말</h2>
      <div className="group">
        <button type="button" className="row" onClick={onShowGuide}>
          <span className="row__icon" aria-hidden="true">
            <BookOpen />
          </span>
          <span className="row__body">
            <span className="row__title">사용법 다시 보기</span>
          </span>
          <ChevronRight className="row__chev" aria-hidden="true" />
        </button>
      </div>

      <h2 className="group-label">데이터</h2>
      <div className="group">
        <button
          type="button"
          className="row row--danger"
          onClick={() => void handleClearAll()}
          disabled={clearing}
        >
          <span className="row__icon row__icon--danger" aria-hidden="true">
            <Trash2 />
          </span>
          <span className="row__body">
            <span className="row__title">{clearing ? '지우는 중' : '등록한 약 모두 지우기'}</span>
            <span className="row__sub row__sub--guide">하나씩 지우려면 내 약 탭에서 지워 주세요.</span>
          </span>
        </button>
      </div>

      <h2 className="group-label">알아 두세요</h2>
      <div className="group detail-box">
        <p className="detail-text settings-disclaimer">
          식품의약품안전처 공개 자료로 만든 <b>참고용 정보</b>예요. 진료가 아니며 약사나 의사
          상담을 대신하지 않아요. 드실지는 꼭 약사나 의사와 상의해서 정해&nbsp;주세요.
        </p>
      </div>
    </>
  )
}
