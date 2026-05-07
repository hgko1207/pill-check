import { SearchScreen } from './components/SearchScreen'
import { Disclaimer } from './components/Disclaimer'

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">PillCheck</h1>
        <p className="app__subtitle">약·영양제 상호작용 체크</p>
      </header>
      <main className="app__main">
        <SearchScreen />
      </main>
      <Disclaimer />
    </div>
  )
}
