import { useState } from 'react'
import { SearchScreen } from './components/SearchScreen'
import { RegisteredList } from './components/RegisteredList'
import { Disclaimer } from './components/Disclaimer'
import { InstallHint } from './components/InstallHint'
import { FontToggle } from './components/FontToggle'

export default function App() {
  const [refreshSignal, setRefreshSignal] = useState(0)

  return (
    <div className="app">
      <header className="app__header">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className="app__title">PillCheck</h1>
            <p className="app__subtitle">약·영양제 상호작용 체크</p>
          </div>
          <FontToggle />
        </div>
      </header>
      <main className="app__main stack">
        <InstallHint />
        <RegisteredList
          refreshSignal={refreshSignal}
          onChange={() => setRefreshSignal((n) => n + 1)}
        />
        <div className="section-divider">새 제품 검사</div>
        <SearchScreen onMedicationsChanged={() => setRefreshSignal((n) => n + 1)} />
      </main>
      <Disclaimer />
    </div>
  )
}
