import { Pill, Search, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ViewKey = 'check' | 'meds' | 'settings'

const ITEMS: { key: ViewKey; label: string; Icon: LucideIcon }[] = [
  { key: 'check', label: '확인', Icon: Search },
  { key: 'meds', label: '내 약', Icon: Pill },
  { key: 'settings', label: '설정', Icon: Settings },
]

interface Props {
  current: ViewKey
  onChange: (next: ViewKey) => void
}

export function BottomNav({ current, onChange }: Props) {
  return (
    <nav className="tabbar" aria-label="주요 화면">
      <div className="tabbar__inner">
        {ITEMS.map(({ key, label, Icon }) => (
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
