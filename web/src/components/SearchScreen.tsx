import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  CircleAlert,
  Info,
  Pill,
  ScanBarcode,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { searchDrug, searchDrugByBarcode } from '../lib/nedrug-api'
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
    // 이 API 응답에는 MAIN_INGR이 없고 MAIN_ITEM_INGR("[M코드]한글")만 온다 (2026-11-12 확인)
    ingredient: item.MAIN_ITEM_INGR ?? item.MAIN_INGR,
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

/** value가 ms 넘게 유지될 때만 그 값을, 아니면 null을 돌려준다 */
function useDelayed<T>(value: T | null, ms: number): T | null {
  const [shown, setShown] = useState<T | null>(null)
  useEffect(() => {
    if (value === null) {
      setShown(null)
      return
    }
    const t = setTimeout(() => setShown(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return shown
}

export function SearchScreen({ onMedicationsChanged, refreshSignal, onOpenDetail, onShowMeds, rootSignal }: Props) {
  const [query, setQuery] = useState('')
  /** 마지막으로 검색한 말 (입력 중인 query와 구분) */
  const [searchedTerm, setSearchedTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultWithRaw[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [tvOpen, setTvOpen] = useState(false)
  const [interactionContext, setInteractionContext] = useState<{
    result: InteractionResult
    product: UnifiedSearchResult
    registered: RegisteredMedication[]
  } | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)
  // 금방 끝나는 작업(저장된 DUR 결과 등)에서 스피너가 번쩍이지 않게, 0.3초가 넘을 때만 보여 준다
  const showPending = useDelayed(actionPending, 300)
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
      setError(null)
      setWarn(null)
      setInfo(null)

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

      // 검색어는 결과와 함께 바꾼다: 찾는 동안에는 이전 결과와 성분 카드를 그대로 둔다 (사라졌다 나타나는 깜빡임 방지)
      setSearchedTerm(q)
      setResults(merged)
      // 의약품 검색이 실패하면 오류, 영양제만 실패하면 경고 (의약품 결과는 살아 있음)
      if (drugError) setError(drugError)
      else if (hfError) setWarn(hfError)
      setLoading(false)
    },
    [query],
  )

  // 상자 바코드는 의약품만 찾을 수 있다. 영양제 바코드는 식품안전나라 바코드 서비스 활용신청 승인 뒤에 연결한다
  const handleScan = useCallback(async (text: string) => {
    setScannerOpen(false)
    setError(null)
    setWarn(null)
    setInfo(null)
    const code = text.trim()
    const notFound = '이 바코드로는 제품을 못 찾았어요. 영양제는 아직 바코드로 찾을 수 없으니, 제품 이름으로 찾아 주세요.'
    if (!/^\d{8,14}$/.test(code)) {
      setInfo(notFound)
      return
    }
    setLoading(true)
    try {
      const drugs = (await searchDrugByBarcode(code)).map(adaptDrug).filter((d): d is DrugWithRaw => d !== null)
      if (drugs.length === 0) {
        setInfo(notFound)
      } else {
        setQuery(drugs[0].name)
        setSearchedTerm(drugs[0].name)
        setResults(drugs)
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [])

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
    setInfo(null)
    inputRef.current?.focus()
  }

  async function handleRegister(item: SearchResultWithRaw) {
    if (actionPending) return
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
      toast(`${item.name} 내\u00A0약에 등록했어요.`, 'success')
      onMedicationsChanged?.()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setActionPending(null)
    }
  }

  // 결과 화면의 "다시 확인"도 이 함수를 쓴다 (그쪽은 raw 없는 UnifiedSearchResult만 갖고 있다)
  async function handleCheck(item: UnifiedSearchResult) {
    if (actionPending) return
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
      {/* 홈 첫 줄: 등록해 둔 내 약 요약. 누르면 내 약 탭 */}
      {showHome && registered.length > 0 && (
        <button type="button" className="hello-card" onClick={() => onShowMeds?.()}>
          <span className="hello-card__icon" aria-hidden="true">
            <Pill />
          </span>
          <span className="hello-card__body">
            <span className="hello-card__title">내 약 {registered.length}개를 등록해 두셨어요</span>
            <span className="hello-card__sub">새 제품을 찾아 약 궁합을 보세요.</span>
          </span>
          <ChevronRight className="row__chev" aria-hidden="true" />
        </button>
      )}
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
          <span className="sr-only">약이나 영양제 이름</span>
          <input
            ref={inputRef}
            className="field__input"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="약이나 영양제 이름"
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
      {info && !error && (
        <div className="notice notice--info" role="status">
          <Info aria-hidden="true" />
          <span>{info}</span>
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
              <span className="quick__label">TV에서 들은 성분&nbsp;찾기</span>
            </button>
          </div>

          {scannerOpen && (
            <div className="group scanner-box">
              <BarcodeScanner onScan={(text) => void handleScan(text)} onError={() => setError('카메라를 켜지 못했어요. 카메라 사용을 허용한 뒤 다시 눌러 주세요.')} />
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
                    <div className="row__sub row__sub--guide">드시는 약을 검색해서 "내 약에 등록"을 누르면 돼요.</div>
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
          {searchedTerm && <IngredientCard term={searchedTerm} />}

          <h2 className="group-label">
            검색 결과 {results.length}개
          </h2>

          {results.length === 0 ? (
            <div className="notice notice--info">
              <Info aria-hidden="true" />
              <span>"{searchedTerm}" 검색 결과가 없어요. 이름이나 띄어쓰기를 바꿔서 다시 찾아&nbsp;보세요.</span>
            </div>
          ) : (
            <ul className="group">
              {results.map((item) => {
                const isPending = showPending === item.id
                const isRegistered = registeredIds.has(item.id)
                // 상세 아래 버튼: 상세를 닫고 이 줄의 버튼과 같은 동작
                const actions = {
                  onCheck: () => void handleCheck(item),
                  onRegister: isRegistered ? undefined : () => void handleRegister(item),
                }
                const detailTarget: DetailTarget =
                  item.kind === 'drug'
                    ? { kind: 'drug', raw: item.raw, actions }
                    : { kind: 'healthfood', raw: item.raw, actions }
                return (
                  <li key={`${item.kind}-${item.id}`} className="result-item">
                    <button type="button" className="row result-item__main" onClick={() => onOpenDetail?.(detailTarget)}>
                      <span className="row__body">
                        <span className="row__title result-item__name">{item.name}</span>
                        <span className="row__sub">
                          {item.kind === 'drug' ? '의약품' : '영양제'}
                          {isRegistered && ' (내\u00A0약에 등록됨)'}
                        </span>
                        {item.manufacturer && (
                          <span className="row__sub">
                            {item.kind === 'drug' ? '제조사' : '제조'} {item.manufacturer}
                          </span>
                        )}
                        {item.kind === 'healthfood' && item.sameNameCount > 1 && (
                          <span className="row__sub">같은 이름 신고 {item.sameNameCount}건</span>
                        )}
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
                        {isPending ? <span className="spinner" aria-hidden="true" /> : '약 궁합 보기'}
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
          onRetry={() => handleCheck(interactionContext.product)}
          onCheckAnother={() => {
            setInteractionContext(null)
            clearSearch()
          }}
        />
      )}
    </>
  )
}
