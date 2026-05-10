export type ViewKey = 'home' | 'search' | 'settings'

interface NavItem {
  key: ViewKey
  icon: string
  label: string
}

const ITEMS: NavItem[] = [
  { key: 'home', icon: '🏠', label: '홈' },
  { key: 'search', icon: '🔍', label: '검색' },
  { key: 'settings', icon: '⚙️', label: '설정' },
]

interface Props {
  current: ViewKey
  onChange: (next: ViewKey) => void
}

export function BottomNav({ current, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="주요 화면 이동">
      {ITEMS.map((item) => {
        const isActive = current === item.key
        return (
          <button
            key={item.key}
            className={`bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
            onClick={() => onChange(item.key)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
          >
            <span className="bottom-nav__icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
