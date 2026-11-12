import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  CircleAlert,
  Info,
  ScanBarcode,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { searchDrug } from '../lib/nedrug-api'
import { searchHealthFood, isFoodSafetyConfigured, groupSameName } from '../lib/healthfood-api'
import { addMedication, listMedications } from '../lib/db'
import { checkInteraction } from '../lib/dur'
import { friendlyError } from '../lib/errors'
import { useDialog } from '../lib/dialog'
import { INGREDIENTS } from '../lib/ingredient-alias'
import type { NedrugItem, InteractionResult, UnifiedSearchResult } from '../lib/types'
import type { HealthFoodItem } from '../lib/healthfood-api'
import type { RegisteredMedication } from '../lib/db'
import { BarcodeScanner } from './BarcodeScanner'
import { ResultSheet } from './ResultSheet'
import { IngredientCard } from './IngredientCard'
import { Disclaimer } from './Disclaimer'
import type { DetailTarget } from './DetailModal'

interface Props {
  onMedicationsChanged?: () => void
  /** 부모(App)에서 갱신 신호 — 등록약을 다시 불러온다 */
  refreshSignal?: number
  /** 결과 줄을 누르면 상세 화면 열기 */
  onOpenDetail?: (target: DetailTarget) => void
  /** "내 약" 탭으로 이동 */
  onShowMeds?: () => void
  /** 지금 탭을 다시 누르면 바뀌는 값: 결과 화면을 닫고 처음으로 */
  rootSignal?: number
}

interface DrugWithRaw extends UnifiedSearchResult {
  kind: 'drug'
  raw: NedrugItem
}

interface HealthFoodWithRaw extends UnifiedSearchResult {
  kind: 'healthfood'
  raw: HealthFoodItem
  /** 같은 제품명으로 묶인 신고 건수 (제조 공장만 다름) */
  sameNameCount: number
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

function adaptHealthFood(item: HealthFoodItem, sameNameCount: number): HealthFoodWithRaw | null {
  // 품목보고번호는 제품마다 고유(로컬 I0030 46,295건 중 빈 값·중복 0). 허가일자(PRMS_DT)는 여러 제품이 같아 쓰지 않는다
  const id = item.PRDLST_REPORT_NO || item.PRDLST_NM
  if (!id || !item.PRDLST_NM) return null
  return {
    kind: 'healthfood',
    id,
    name: item.PRDLST_NM,
    manufacturer: item.BSSH_NM,
    ingredient: item.RAWMTRL_NM,
    raw: item,
    sameNameCount,
  }
}

const isOldName = (item: HealthFoodItem) => /^\s*\(구\)/.test(item.PRDLST_NM ?? '')

export function SearchScreen({ onMedicationsChanged, refreshSignal, onOpenDetail, onShowMeds, rootSignal }: Props) {
  const [query, setQuery] = useState('')
  /** 마지막으로 검색한 말 (입력 중인 query와 구분) */
  const [searchedTerm, setSearchedTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultWithRaw[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [tvOpen, setTvOpen] = useState(false)
  const [interactionContext, setInteractionContext] = useState<{
    result: InteractionResult
    product: UnifiedSearchResult
    registered: RegisteredMedication[]
  } | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [registered, setRegistered] = useState<RegisteredMedication[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useDialog()

  useEffect(() => {
    let cancelled = false
    listMedications().then((list) => {
      if (!cancelled) setRegistered(list)
    })
    return () => {
      cancelled = true
    }
  }, [refreshSignal])

  // 확인 탭을 다시 누르면 결과 화면을 닫는다 (앱의 탭 다시 누르기 동작)
  useEffect(() => {
    if (rootSignal) setInteractionContext(null)
  }, [rootSignal])

  const registeredIds = new Set(registered.map((m) => m.itemSeq))

  const handleSearch = useCallback(
    async (term?: string) => {
      const q = (term ?? query).trim()
      if (q.length < 2) {
        setError('두 글자 이상 입력해 주세요.')
        return
      }
      setLoading(true)
      setSearchedTerm(q)
      setError(null)
      setWarn(null)

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
          // 이름이 "(구)"로 시작하는 옛 신고는 뒤로 (빼지는 않는다). sort는 안정 정렬이라 나머지 순서는 그대로
          const groups = groupSameName(hfRes.value as HealthFoodItem[]).sort(
            (a, b) => Number(isOldName(a.item)) - Number(isOldName(b.item)),
          )
          for (const { item, count } of groups) {
            const adapted = adaptHealthFood(item, count)
            if (adapted) merged.push(adapted)
          }
        } else {
          hfError = friendlyError(hfRes.reason)
        }
      }

      setResults(merged)
      // 의약품 검색이 실패하면 오류, 영양제만 실패하면 경고 (의약품 결과는 살아 있음)
      if (drugError) setError(drugError)
      else if (hfError) setWarn(hfError)
      setLoading(false)
    },
    [query],
  )

  const handleScan = useCallback(
    (text: string) => {
      setScannerOpen(false)
      setQuery(text)
      void handleSearch(text)
    },
    [handleSearch],
  )

  function searchIngredient(label: string) {
    setTvOpen(false)
    setQuery(label)
    void handleSearch(label)
  }

  function clearSearch() {
    setQuery('')
    setResults(null)
    setSearchedTerm('')
    setError(null)
    setWarn(null)
    inputRef.current?.focus()
  }

  async function handleRegister(item: SearchResultWithRaw) {
    setActionPending(item.id)
    setError(null)
    try {
      await addMedication({
        kind: item.kind,
        itemSeq: item.id,
        itemName: item.name,
        manufacturer: item.manufacturer,
        mainIngredient: item.ingredient,
      })
      setRegistered(await listMedications())
      toast(`"${item.name}"을(를) 내 약에 등록했어요.`, 'success')
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
    try {
      const list = await listMedications()
      const result = await checkInteraction(item, list)
      setInteractionContext({ result, product: item, registered: list })
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setActionPending(null)
    }
  }

  const showHome = results === null && !loading

  return (
    <>
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSearch()
        }}
      >
        <label className="field">
          <Search aria-hidden="true" />
          <span className="sr-only">약·영양제 이름</span>
          <input
            ref={inputRef}
            className="field__input"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="약·영양제 이름 입력"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="field__clear" onClick={clearSearch} aria-label="지우기">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        {query.trim().length > 0 && (
          <button type="submit" className="btn btn--primary search-form__submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" /> 찾는 중
              </>
            ) : (
              '검색'
            )}
          </button>
        )}
      </form>

      {error && (
        <div className="notice notice--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {warn && !error && (
        <div className="notice notice--warn" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>{warn}</span>
        </div>
      )}

      {showHome && (
        <>
          <div className="quick">
            <button
              type="button"
              className="quick__tile"
              aria-expanded={scannerOpen}
              onClick={() => {
                setScannerOpen((v) => !v)
                setTvOpen(false)
              }}
            >
              <span className="quick__icon" aria-hidden="true">
                <ScanBarcode />
              </span>
              <span className="quick__label">{scannerOpen ? '바코드 닫기' : '바코드로 찾기'}</span>
            </button>
            <button
              type="button"
              className="quick__tile"
              aria-expanded={tvOpen}
              onClick={() => {
                setTvOpen((v) => !v)
                setScannerOpen(false)
              }}
            >
              <span className="quick__icon" aria-hidden="true">
                <Sparkles />
              </span>
              <span className="quick__label">TV에서 들은 성분&nbsp;확인</span>
            </button>
          </div>

          {scannerOpen && (
            <div className="group scanner-box">
              <BarcodeScanner onScan={handleScan} onError={(msg) => setError(`카메라를 쓸 수 없어요. ${msg}`)} />
              <p className="scanner-box__hint">제품 바코드를 화면 가운데에 비춰 주세요.</p>
            </div>
          )}

          {tvOpen && (
            <div className="group tv-box">
              <p className="tv-box__hint">어떤 성분을 들으셨어요?</p>
              <div className="chip-row">
                {INGREDIENTS.map((ing) => (
                  <button key={ing.key} type="button" className="chip" onClick={() => searchIngredient(ing.label)}>
                    {ing.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <h2 className="group-label">내 약 {registered.length > 0 ? `${registered.length}개` : ''}</h2>
          <ul className="group">
            {registered.length === 0 ? (
              <li>
                <div className="row">
                  <div className="row__body">
                    <div className="row__title">아직 등록한 약이 없어요</div>
                    <div className="row__sub">드시는 약을 검색해서 "등록"을 누르면 추가돼요.</div>
                  </div>
                </div>
              </li>
            ) : (
              <>
                {registered.slice(0, 2).map((m) => (
                  <li key={m.id ?? m.itemSeq}>
                    <div className="row">
                      <div className="row__body">
                        <div className="row__title">{m.itemName}</div>
                        <div className="row__sub">{m.kind === 'drug' ? '의약품' : '영양제'}</div>
                      </div>
                    </div>
                  </li>
                ))}
                <li>
                  <button type="button" className="row" onClick={onShowMeds}>
                    <span className="row__body row__title row__title--link">
                      {registered.length > 2 ? `전체 보기 (${registered.length}개)` : '내 약 관리'}
                    </span>
                    <ChevronRight className="row__chev" aria-hidden="true" />
                  </button>
                </li>
              </>
            )}
          </ul>
          <Disclaimer />
        </>
      )}

      {loading && results === null && (
        <p className="loading-line">
          <span className="spinner" aria-hidden="true" /> 식약처 자료에서 찾고 있어요
        </p>
      )}

      {results !== null && (
        <>
          {!loading && searchedTerm && <IngredientCard term={searchedTerm} />}

          <h2 className="group-label">
            검색 결과 {results.length}개
          </h2>

          {results.length === 0 ? (
            <div className="notice notice--info">
              <Info aria-hidden="true" />
              <span>"{searchedTerm}"(으)로 찾은 제품이 없어요. 다른 이름이나 띄어쓰기를 바꿔 다시 찾아&nbsp;보세요.</span>
            </div>
          ) : (
            <ul className="group">
              {results.map((item) => {
                const isPending = actionPending === item.id
                const isRegistered = registeredIds.has(item.id)
                const detailTarget: DetailTarget =
                  item.kind === 'drug' ? { kind: 'drug', raw: item.raw } : { kind: 'healthfood', raw: item.raw }
                return (
                  <li key={`${item.kind}-${item.id}`} className="result-item">
                    <button type="button" className="row result-item__main" onClick={() => onOpenDetail?.(detailTarget)}>
                      <span className="row__body">
                        <span className="row__title result-item__name">{item.name}</span>
                        <span className="row__sub">
                          {[
                            item.kind === 'drug' ? '의약품' : '영양제',
                            isRegistered && '내\u00A0약에 등록됨',
                            item.manufacturer && `${item.kind === 'drug' ? '제조사' : '제조'} ${item.manufacturer}`,
                            item.kind === 'healthfood' && item.sameNameCount > 1 && `같은 이름 신고 ${item.sameNameCount}건`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <ChevronRight className="row__chev" aria-hidden="true" />
                    </button>
                    <div className="result-item__actions">
                      <button
                        type="button"
                        className="btn btn--primary btn--small"
                        onClick={() => void handleCheck(item)}
                        disabled={isPending}
                      >
                        {isPending ? <span className="spinner" aria-hidden="true" /> : '내 약과 확인'}
                      </button>
                      {!isRegistered && (
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          onClick={() => void handleRegister(item)}
                          disabled={isPending}
                        >
                          내 약에 등록
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Disclaimer />
        </>
      )}

      {interactionContext && (
        <ResultSheet
          result={interactionContext.result}
          product={interactionContext.product}
          registered={interactionContext.registered}
          onClose={() => setInteractionContext(null)}
          onCheckAnother={() => {
            setInteractionContext(null)
            clearSearch()
          }}
        />
      )}
    </>
  )
}
