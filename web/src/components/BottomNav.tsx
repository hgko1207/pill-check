import { Pill, Search, Settings, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ViewKey = 'check' | 'meds' | 'family' | 'settings'

const ITEMS: { key: ViewKey; label: string; Icon: LucideIcon }[] = [
  { key: 'check', label: '확인', Icon: Search },
  { key: 'meds', label: '내 약', Icon: Pill },
  { key: 'family', label: '가족', Icon: Users },
  { key: 'settings', label: '설정', Icon: Settings },
]

interface Props {
  current: ViewKey
  onChange: (next: ViewKey) => void
  /** 보는 사람·관리자 기기에서만 가족 탭을 보인다 */
  showFamily?: boolean
}

export function BottomNav({ current, onChange, showFamily = false }: Props) {
  const items = showFamily ? ITEMS : ITEMS.filter((i) => i.key !== 'family')
  return (
    <nav className="tabbar" aria-label="주요 화면">
      <div className="tabbar__inner">
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className="tabbar__item"
            onClick={() => onChange(key)}
            aria-current={current === key ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
