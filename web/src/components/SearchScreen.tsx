import { useCallback, useState } from 'react'
import { searchDrug, MissingApiKeyError, NedrugRequestError } from '../lib/nedrug-api'
import {
  searchHealthFood,
  isFoodSafetyConfigured,
  FoodSafetyKeyMissingError,
  FoodSafetyAuthError,
} from '../lib/healthfood-api'
import {
  addMedication,
  listMedications,
  MedicationLimitError,
  DuplicateMedicationError,
} from '../lib/db'
import { checkInteraction } from '../lib/dur'
import type { NedrugItem, InteractionResult, UnifiedSearchResult } from '../lib/types'
import type { HealthFoodItem } from '../lib/healthfood-api'
import { BarcodeScanner } from './BarcodeScanner'
import { InteractionResultCard } from './InteractionResultCard'

interface Props {
  onMedicationsChanged?: () => void
}

interface DrugWithRaw extends UnifiedSearchResult {
  kind: 'drug'
  raw: NedrugItem
}

interface HealthFoodWithRaw extends UnifiedSearchResult {
  kind: 'healthfood'
  raw: HealthFoodItem
}

type SearchResultWithRaw = DrugWithRaw | HealthFoodWithRaw

function adaptDrug(item: NedrugItem): DrugWithRaw | null {
  if (!item.ITEM_SEQ || !item.ITEM_NAME) return null
  return {
    kind: 'drug',
    id: item.ITEM_SEQ,
    name: item.ITEM_NAME,
    manufacturer: item.ENTP_NAME,
    ingredient: item.MAIN_INGR,
    raw: item,
  }
}

function adaptHealthFood(item: HealthFoodItem): HealthFoodWithRaw | null {
  const id = item.PRMS_DT || item.STTEMNT_NO || item.PRDLST_NM
  if (!id || !item.PRDLST_NM) return null
  return {
    kind: 'healthfood',
    id,
    name: item.PRDLST_NM,
    manufacturer: item.BSSH_NM,
    ingredient: item.RAWMTRL_NM,
    raw: item,
  }
}

export function SearchScreen({ onMedicationsChanged }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultWithRaw[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
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
      setWarn(null)
      setInteractionResult(null)

      const promises: Promise<unknown>[] = [searchDrug(q)]
      if (isFoodSafetyConfigured()) {
        promises.push(searchHealthFood(q))
      }

      const [drugRes, hfRes] = await Promise.allSettled(promises)

      const merged: SearchResultWithRaw[] = []
      let drugError: string | null = null
      let hfError: string | null = null

      if (drugRes.status === 'fulfilled') {
        for (const item of drugRes.value as NedrugItem[]) {
          const adapted = adaptDrug(item)
          if (adapted) merged.push(adapted)
        }
      } else {
        const e = drugRes.reason
        if (e instanceof MissingApiKeyError) drugError = e.message
        else if (e instanceof NedrugRequestError) drugError = e.message
        else drugError = `의약품 검색 실패: ${e instanceof Error ? e.message : String(e)}`
      }

      if (hfRes) {
        if (hfRes.status === 'fulfilled') {
          for (const item of hfRes.value as HealthFoodItem[]) {
            const adapted = adaptHealthFood(item)
            if (adapted) merged.push(adapted)
          }
        } else {
          const e = hfRes.reason
          if (e instanceof FoodSafetyKeyMissingError || e instanceof FoodSafetyAuthError) {
            hfError = e.message
          } else {
            hfError = `영양제 검색 실패: ${e instanceof Error ? e.message : String(e)}`
          }
        }
      }

      setResults(merged)

      if (drugError && (!hfRes || hfRes.status === 'rejected')) {
        setError(drugError)
      } else if (drugError) {
        setError(drugError)
      } else if (hfError && hfRes && !isFoodSafetyConfigured()) {
        // no foodsafety key: show subtle warning, not error
        setWarn(hfError)
      } else if (hfError) {
        setWarn(hfError)
      }

      if (merged.length === 0 && !drugError) {
        setInfo('검색 결과가 없습니다. 다른 이름으로 시도해보세요.')
      }

      setLoading(false)
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

  async function handleRegister(item: SearchResultWithRaw) {
    if (item.kind !== 'drug') return
    setActionPending(item.id)
    setError(null)
    setInfo(null)
    try {
      await addMedication({
        itemSeq: item.id,
        itemName: item.name,
        manufacturer: item.manufacturer,
        mainIngredient: item.ingredient,
      })
      setInfo(`"${item.name}" 을(를) 등록했습니다.`)
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

  async function handleCheck(item: SearchResultWithRaw) {
    setActionPending(item.id)
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

  const drugCount = results.filter((r) => r.kind === 'drug').length
  const hfCount = results.filter((r) => r.kind === 'healthfood').length

  return (
    <section className="stack">
      <input
        className="input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="약 또는 영양제 이름 (예: 타이레놀, 오메가3)"
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
      {warn && !error && <div className="banner banner--warn">{warn}</div>}
      {info && !error && <div className="banner banner--info">{info}</div>}

      {interactionResult && <InteractionResultCard result={interactionResult} />}

      {results.length > 0 && (
        <>
          <div className="section-divider">
            검색 결과 — 의약품 {drugCount}개{hfCount > 0 ? `, 영양제 ${hfCount}개` : ''}
          </div>
          {results.map((item) => {
            const isPending = actionPending === item.id
            const isDrug = item.kind === 'drug'
            return (
              <div key={`${item.kind}-${item.id}`} className="card">
                <div className="card__badge-row">
                  <span className={`badge ${isDrug ? 'badge--drug' : 'badge--healthfood'}`}>
                    {isDrug ? '💊 의약품' : '🌿 영양제'}
                  </span>
                </div>
                <h3 className="card__title">{item.name}</h3>
                {item.manufacturer && (
                  <p className="card__meta">
                    {isDrug ? '제조사' : '업체'}: {item.manufacturer}
                  </p>
                )}
                {item.ingredient && (
                  <p className="card__meta">
                    {isDrug ? '성분' : '원료'}:{' '}
                    {item.ingredient.length > 120
                      ? item.ingredient.slice(0, 120) + '…'
                      : item.ingredient}
                  </p>
                )}
                <div className="card__actions">
                  {isDrug && (
                    <button
                      className="btn-small btn-small--primary"
                      onClick={() => void handleRegister(item)}
                      disabled={isPending}
                    >
                      {isPending ? '처리 중…' : '+ 이 약 등록'}
                    </button>
                  )}
                  <button
                    className="btn-small"
                    onClick={() => void handleCheck(item)}
                    disabled={isPending}
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
