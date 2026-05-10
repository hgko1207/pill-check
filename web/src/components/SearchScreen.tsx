import { useCallback, useEffect, useState } from 'react'
import { searchDrug } from '../lib/nedrug-api'
import { searchHealthFood, isFoodSafetyConfigured } from '../lib/healthfood-api'
import { addMedication, listMedications } from '../lib/db'
import { checkInteraction } from '../lib/dur'
import { friendlyError } from '../lib/errors'
import type { NedrugItem, InteractionResult, UnifiedSearchResult } from '../lib/types'
import type { HealthFoodItem } from '../lib/healthfood-api'
import type { RegisteredMedication } from '../lib/db'
import { BarcodeScanner } from './BarcodeScanner'
import { InteractionResultCard } from './InteractionResultCard'
import type { DetailTarget } from './DetailModal'

interface Props {
  onMedicationsChanged?: () => void
  /** 부모(App)에서 갱신 신호 — registered set을 다시 로드 */
  refreshSignal?: number
  /** 카드 클릭 시 상세정보 모달 열기 */
  onOpenDetail?: (target: DetailTarget) => void
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

export function SearchScreen({ onMedicationsChanged, refreshSignal, onOpenDetail }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultWithRaw[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [interactionContext, setInteractionContext] = useState<{
    result: InteractionResult
    product: UnifiedSearchResult
    registered: RegisteredMedication[]
  } | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [registeredItemSeqs, setRegisteredItemSeqs] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    listMedications().then((list) => {
      if (cancelled) return
      setRegisteredItemSeqs(new Set(list.map((m) => m.itemSeq)))
    })
    return () => {
      cancelled = true
    }
  }, [refreshSignal])

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
      setInteractionContext(null)

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
        drugError = friendlyError(drugRes.reason)
      }

      if (hfRes) {
        if (hfRes.status === 'fulfilled') {
          for (const item of hfRes.value as HealthFoodItem[]) {
            const adapted = adaptHealthFood(item)
            if (adapted) merged.push(adapted)
          }
        } else {
          hfError = friendlyError(hfRes.reason)
        }
      }

      setResults(merged)

      // 의약품 검색이 실패하면 빨간 에러
      // 영양제만 실패하면 노란 경고 (의약품 결과는 살아있음)
      if (drugError) {
        setError(drugError)
      } else if (hfError) {
        setWarn(hfError)
      }

      if (merged.length === 0 && !drugError) {
        setInfo('검색 결과가 없어요. 다른 이름으로 다시 시도해주세요.')
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
      setInfo(`✅ "${item.name}" 을(를) 등록했어요.`)
      setRegisteredItemSeqs((prev) => new Set([...prev, item.id]))
      onMedicationsChanged?.()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setActionPending(null)
    }
  }

  async function handleCheck(item: SearchResultWithRaw) {
    setActionPending(item.id)
    setError(null)
    setInfo(null)
    setInteractionContext(null)
    try {
      const registered = await listMedications()
      const result = await checkInteraction(item, registered)
      setInteractionContext({ result, product: item, registered })
      // 결과 카드로 부드럽게 스크롤
      setTimeout(() => {
        document.querySelector('.result-card')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 50)
    } catch (e) {
      setError(friendlyError(e))
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
        {loading ? (
          <>
            <span className="spinner spinner--on-primary" /> 검색 중… (몇 초 안에 끝나요)
          </>
        ) : (
          '검색'
        )}
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

      {interactionContext && (
        <InteractionResultCard
          result={interactionContext.result}
          product={interactionContext.product}
          registered={interactionContext.registered}
        />
      )}

      {results.length > 0 && (
        <>
          <div className="section-divider">
            검색 결과 — 의약품 {drugCount}개{hfCount > 0 ? `, 영양제 ${hfCount}개` : ''}
          </div>
          {results.map((item) => {
            const isPending = actionPending === item.id
            const isDrug = item.kind === 'drug'
            const isRegistered = isDrug && registeredItemSeqs.has(item.id)
            const detailTarget: DetailTarget =
              item.kind === 'drug'
                ? { kind: 'drug', raw: item.raw }
                : { kind: 'healthfood', raw: item.raw }
            const openDetail = () => onOpenDetail?.(detailTarget)
            return (
              <div
                key={`${item.kind}-${item.id}`}
                className={`card ${onOpenDetail ? 'card--clickable' : ''}`}
                onClick={onOpenDetail ? openDetail : undefined}
                onKeyDown={
                  onOpenDetail
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openDetail()
                        }
                      }
                    : undefined
                }
                role={onOpenDetail ? 'button' : undefined}
                tabIndex={onOpenDetail ? 0 : undefined}
              >
                <div className="card__badge-row">
                  <span className={`badge ${isDrug ? 'badge--drug' : 'badge--healthfood'}`}>
                    {isDrug ? '💊 의약품' : '🌿 영양제'}
                  </span>
                  {isRegistered && (
                    <span className="badge badge--registered">✓ 등록됨</span>
                  )}
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
                {onOpenDetail && (
                  <p className="card__detail-hint">탭하면 상세 정보 보기 →</p>
                )}
                {/* 액션 버튼: 카드 클릭 이벤트 버블링 방지 */}
                <div
                  className="card__actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isDrug && !isRegistered && (
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
                    {isPending ? (
                      <>
                        <span className="spinner" /> 검사 중…
                      </>
                    ) : (
                      '⚠️ 충돌 검사'
                    )}
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
