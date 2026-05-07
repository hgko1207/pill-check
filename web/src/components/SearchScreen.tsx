import { useCallback, useState } from 'react'
import { searchDrug, MissingApiKeyError, NedrugRequestError } from '../lib/nedrug-api'
import type { NedrugItem } from '../lib/types'
import { BarcodeScanner } from './BarcodeScanner'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<NedrugItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)

  const handleSearch = useCallback(async (term?: string) => {
    const q = (term ?? query).trim()
    if (q.length < 2) {
      setError('두 글자 이상 입력해주세요')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const items = await searchDrug(q)
      setResults(items)
      if (items.length === 0) setInfo('검색 결과가 없습니다. 다른 이름으로 시도해보세요.')
    } catch (e) {
      if (e instanceof MissingApiKeyError) setError(e.message)
      else if (e instanceof NedrugRequestError) setError(e.message)
      else setError(`검색 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [query])

  const handleScan = useCallback((text: string) => {
    setScannerOpen(false)
    setQuery(text)
    setInfo(`바코드 인식: ${text} — 검색을 실행합니다.`)
    void handleSearch(text)
  }, [handleSearch])

  return (
    <div className="stack">
      <input
        className="input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="약 이름 (예: 타이레놀)"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button className="btn" onClick={() => void handleSearch()} disabled={loading}>
        {loading ? '검색 중...' : '검색'}
      </button>
      <button
        className="btn btn--secondary"
        onClick={() => setScannerOpen((v) => !v)}
      >
        {scannerOpen ? '바코드 스캔 닫기' : '바코드로 찾기'}
      </button>

      {scannerOpen && (
        <div className="card">
          <BarcodeScanner
            onScan={handleScan}
            onError={(msg) => setError(`카메라 오류: ${msg}`)}
          />
          <p className="card__meta" style={{ marginTop: 8 }}>
            제품 패키지의 바코드를 화면 가운데에 비춰주세요.
          </p>
        </div>
      )}

      {error && <div className="banner banner--error">{error}</div>}
      {info && !error && <div className="banner banner--info">{info}</div>}

      {results.map((item, idx) => (
        <div key={item.ITEM_SEQ ?? `${item.ITEM_NAME}-${idx}`} className="card">
          <h3 className="card__title">{item.ITEM_NAME ?? '(이름 없음)'}</h3>
          {item.ENTP_NAME && <p className="card__meta">제조사: {item.ENTP_NAME}</p>}
          {item.MAIN_INGR && (
            <p className="card__meta">
              성분: {item.MAIN_INGR.length > 120 ? item.MAIN_INGR.slice(0, 120) + '…' : item.MAIN_INGR}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
