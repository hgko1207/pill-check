import { useCallback, useState } from 'react'
import { searchDrug, MissingApiKeyError, NedrugRequestError } from '../lib/nedrug-api'
import {
  addMedication,
  listMedications,
  MedicationLimitError,
  DuplicateMedicationError,
} from '../lib/db'
import { checkInteraction } from '../lib/dur'
import type { NedrugItem, InteractionResult } from '../lib/types'
import { BarcodeScanner } from './BarcodeScanner'
import { InteractionResultCard } from './InteractionResultCard'

interface Props {
  /** 약 등록·삭제 시 부모(예: RegisteredList)에 갱신 신호 전달 */
  onMedicationsChanged?: () => void
}

export function SearchScreen({ onMedicationsChanged }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<NedrugItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [interactionResult, setInteractionResult] = useState<InteractionResult | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)

  const handleSearch = useCallback(
    async (term?: string) => {
      const q = (term ?? query).trim()
      if (q.length < 2) {
        setError('두 글자 이상 입력해주세요')
        return
      }
      setLoading(true)
      setError(null)
      setInfo(null)
      setInteractionResult(null)
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
    },
    [query],
  )

  const handleScan = useCallback(
    (text: string) => {
      setScannerOpen(false)
      setQuery(text)
      setInfo(`바코드 인식: ${text} — 검색을 실행합니다.`)
      void handleSearch(text)
    },
    [handleSearch],
  )

  async function handleRegister(item: NedrugItem) {
    if (!item.ITEM_SEQ || !item.ITEM_NAME) {
      setError('이 항목은 등록에 필요한 정보가 부족합니다.')
      return
    }
    setActionPending(item.ITEM_SEQ)
    setError(null)
    setInfo(null)
    try {
      await addMedication({
        itemSeq: item.ITEM_SEQ,
        itemName: item.ITEM_NAME,
        manufacturer: item.ENTP_NAME,
        mainIngredient: item.MAIN_INGR,
      })
      setInfo(`"${item.ITEM_NAME}" 을(를) 등록했습니다.`)
      onMedicationsChanged?.()
    } catch (e) {
      if (e instanceof MedicationLimitError || e instanceof DuplicateMedicationError) {
        setError(e.message)
      } else {
        setError(`등록 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
    } finally {
      setActionPending(null)
    }
  }

  async function handleCheck(item: NedrugItem) {
    if (!item.ITEM_SEQ) {
      setError('이 항목은 검사에 필요한 정보가 부족합니다.')
      return
    }
    setActionPending(item.ITEM_SEQ)
    setError(null)
    setInfo(null)
    setInteractionResult(null)
    try {
      const registered = await listMedications()
      const result = await checkInteraction(item, registered)
      setInteractionResult(result)
    } catch (e) {
      setError(`충돌 검사 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActionPending(null)
    }
  }

  return (
    <section className="stack">
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
        {loading ? '검색 중…' : '검색'}
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

      {interactionResult && <InteractionResultCard result={interactionResult} />}

      {results.length > 0 && (
        <>
          <div className="section-divider">검색 결과 ({results.length}개)</div>
          {results.map((item, idx) => {
            const isPending = item.ITEM_SEQ && actionPending === item.ITEM_SEQ
            return (
              <div key={item.ITEM_SEQ ?? `${item.ITEM_NAME}-${idx}`} className="card">
                <h3 className="card__title">{item.ITEM_NAME ?? '(이름 없음)'}</h3>
                {item.ENTP_NAME && <p className="card__meta">제조사: {item.ENTP_NAME}</p>}
                {item.MAIN_INGR && (
                  <p className="card__meta">
                    성분:{' '}
                    {item.MAIN_INGR.length > 120
                      ? item.MAIN_INGR.slice(0, 120) + '…'
                      : item.MAIN_INGR}
                  </p>
                )}
                <div className="card__actions">
                  <button
                    className="btn-small btn-small--primary"
                    onClick={() => void handleRegister(item)}
                    disabled={!!isPending}
                  >
                    {isPending ? '처리 중…' : '+ 이 약 등록'}
                  </button>
                  <button
                    className="btn-small"
                    onClick={() => void handleCheck(item)}
                    disabled={!!isPending}
                  >
                    {isPending ? '처리 중…' : '⚠️ 충돌 검사'}
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
