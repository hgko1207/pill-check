import { useEffect, useState } from 'react'
import { ChevronLeft, CircleAlert, Clock, ExternalLink, HeartPulse, TriangleAlert } from 'lucide-react'
import type { NedrugItem } from '../lib/types'
import { IngredientCheck } from './IngredientCheck'
import {
  doseLines,
  shopSearchUrls,
  fetchRecalls,
  findRecall,
  type HealthFoodItem,
  type RecallItem,
} from '../lib/healthfood-api'
import {
  parseDoc,
  paragraphToReadable,
  paragraphToNodes,
  docLines,
  plainLines,
  leadLines,
  findDontArticle,
  isSubheadLine,
  markDose,
  type ParsedDoc,
  type DocNode,
} from '../lib/xmlDoc'

/** 검색 결과에서 연 상세의 아래 버튼. 누르면 상세를 닫고 검색 화면의 같은 동작을 한다 */
export interface DetailActions {
  onCheck: () => void
  /** 이미 등록한 제품이면 없음 */
  onRegister?: () => void
}

export type DetailTarget =
  | { kind: 'drug'; raw: NedrugItem; actions?: DetailActions }
  | { kind: 'healthfood'; raw: HealthFoodItem; actions?: DetailActions }
  | null

interface Props {
  target: DetailTarget
  onClose: () => void
}

/** 제품 상세: 화면 전체를 덮는 화면 (위에 뒤로 버튼) */
export function DetailModal({ target, onClose }: Props) {
  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [target, onClose])

  if (!target) return null
  const actions = target.actions

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div className={actions ? 'sheet__body sheet__body--with-actions' : 'sheet__body'}>
        <div className="topbar">
          <button type="button" className="topbar__back" onClick={onClose} aria-label="뒤로">
            <ChevronLeft aria-hidden="true" />
          </button>
          <p className="topbar__title">{target.kind === 'drug' ? '의약품' : '영양제'}</p>
        </div>
        {target.kind === 'drug' ? (
          <DrugDetail item={target.raw} />
        ) : (
          <HealthFoodDetail item={target.raw} />
        )}
        <p className="fineprint">
          식품의약품안전처 공개 자료로 만든 참고용 정보예요. 진료가 아니며 약사나 의사 상담을
          대신하지&nbsp;않아요.
        </p>
      </div>

      {actions && (
        <div className="action-bar">
          <div className="action-bar__inner">
            {actions.onRegister && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  onClose()
                  actions.onRegister?.()
                }}
              >
                내 약에 등록
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                onClose()
                actions.onCheck()
              }}
            >
              약 궁합 보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────── 의약품 상세 ──────────────── */

function DrugDetail({ item }: { item: NedrugItem }) {
  const cancelled = !!item.CANCEL_DATE
  const ee = parseDoc(item.EE_DOC_DATA)
  const ud = parseDoc(item.UD_DOC_DATA)
  const nb = parseDoc(item.NB_DOC_DATA)
  const mainIngr = item.MAIN_ITEM_INGR ? cleanIngrCode(item.MAIN_ITEM_INGR) : null

  const meta: [string, string][] = []
  if (item.CHART) meta.push(['모양과 색', paragraphToReadable(item.CHART)])
  if (item.STORAGE_METHOD) meta.push(['보관', paragraphToReadable(item.STORAGE_METHOD)])
  if (item.VALID_TERM) meta.push(['유효기간', paragraphToReadable(item.VALID_TERM)])
  if (item.PACK_UNIT) meta.push(['포장', paragraphToReadable(item.PACK_UNIT)])
  if (item.ATC_CODE) meta.push(['ATC 코드', item.ATC_CODE])
  if (item.ITEM_PERMIT_DATE) meta.push(['허가일', formatDate(item.ITEM_PERMIT_DATE)])

  return (
    <article>
      <header className="detail-head">
        <h1 id="detail-title" className="detail-head__title">
          {item.ITEM_NAME ?? '(이름 없음)'}
        </h1>
        <p className="detail-head__sub">
          {item.ETC_OTC_CODE ?? '의약품'}
          {item.ENTP_NAME && (
            <>
              <br />
              제조사 {item.ENTP_NAME}
            </>
          )}
        </p>
        {cancelled && (
          <p className="detail-head__alert">
            <span className="status status--danger">시판 중단 {formatDate(item.CANCEL_DATE)}</span>
          </p>
        )}
      </header>

      {cancelled && (
        <div className="notice notice--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>
            식약처에서 <b>{formatDate(item.CANCEL_DATE)}</b>에 {item.CANCEL_NAME ?? '취하'}된 약이에요.
            등록하기 전에 약사나 의사와 상담해&nbsp;주세요.
          </span>
        </div>
      )}

      <Glance
        rows={[
          { kind: 'use', ...leadLines(docLines(ee)) },
          { kind: 'how', ...leadLines(docLines(ud)) },
        ]}
        dont={findDontArticle(nb)}
      />

      {mainIngr && (
        <DetailSection heading="주성분">
          <p className="detail-text">{mainIngr}</p>
        </DetailSection>
      )}

      {(ee || ud || nb) && <h2 className="group-label">식약처 원문 전체</h2>}
      <div className="folds">
        <DocBlock heading="어디에 먹나요" doc={ee} />
        <DocBlock heading="어떻게 먹나요" doc={ud} />
        <DocBlock heading="주의할 점" doc={nb} />
      </div>

      {(meta.length > 0 || item.INGR_NAME) && (
        <>
          <h2 className="group-label">더 알아보기</h2>
          <div className="folds">
            <FoldSection heading="모양, 보관 방법, 전체 성분">
              {meta.length > 0 && <MetaList items={meta} />}
              {item.INGR_NAME && (
                <>
                  <h3 className="detail-subhead">전체 성분 (첨가제 포함)</h3>
                  <p className="detail-text">{cleanIngrCode(paragraphToReadable(item.INGR_NAME))}</p>
                </>
              )}
            </FoldSection>
          </div>
        </>
      )}
    </article>
  )
}

/* ──────────────── 영양제 상세 ──────────────── */

function HealthFoodDetail({ item }: { item: HealthFoodItem }) {
  const rawmtrl = [item.RAWMTRL_NM, item.ETC_RAWMTRL_NM, item.INDIV_RAWMTRL_NM]
    .filter(Boolean)
    .map((v) => paragraphToReadable(v as string))
    .filter((v) => v.length > 0)
    .join(', ')
  const doses = doseLines(item)
  const shop = item.PRDLST_NM ? shopSearchUrls(item.PRDLST_NM) : null

  const meta: [string, string][] = []
  if (item.POG_DAYCNT) meta.push(['소비기한', item.POG_DAYCNT])
  if (item.PRMS_DT) meta.push(['허가일자', formatDate(item.PRMS_DT)])
  if (item.PRDLST_REPORT_NO) meta.push(['제품 신고 번호', item.PRDLST_REPORT_NO])
  if (item.LCNS_NO) meta.push(['영업 허가 번호', item.LCNS_NO])

  return (
    <article>
      <header className="detail-head">
        <h1 id="detail-title" className="detail-head__title">
          {item.PRDLST_NM ?? '(이름 없음)'}
        </h1>
        <p className="detail-head__sub">
          {item.PRDT_SHAP_CD_NM ? `영양제 (${item.PRDT_SHAP_CD_NM})` : '영양제'}
          {item.BSSH_NM && (
            <>
              <br />
              제조 {item.BSSH_NM}
            </>
          )}
        </p>
      </header>

      <RecallNotice item={item} />

      <Glance
        rows={[
          { kind: 'helps', ...leadLines(plainLines(item.PRIMARY_FNCLTY)) },
          { kind: 'how', ...leadLines(plainLines(item.NTK_MTHD)) },
          { kind: 'caution', ...leadLines(plainLines(item.IFTKN_ATNT_MATR_CN), 0) },
        ]}
      />

      {doses.length > 0 && (
        <section>
          <h2 className="group-label">함량</h2>
          <ul className="group">
            {doses.map((d, i) => {
              const { main, note } = splitDoseName(d.name)
              return (
                <li key={i} className="dose-row">
                  <span className="dose-row__name">
                    {main}
                    {note && <span className="dose-row__note">{note}</span>}
                  </span>
                  <span className="dose-row__amount num">
                    {formatAmount(d.amount)}
                    {d.per && <span className="dose-row__per">제품 {d.per}당</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="group-note">식약처에 신고한 양이에요.</p>
        </section>
      )}

      {(item.PRIMARY_FNCLTY || item.NTK_MTHD || item.IFTKN_ATNT_MATR_CN || rawmtrl) && (
        <h2 className="group-label">식약처 원문 전체</h2>
      )}
      <div className="folds">
        {item.PRIMARY_FNCLTY && (
          <FoldSection heading="어디에 도움이 되나요">
            <Lines lines={plainLines(item.PRIMARY_FNCLTY)} />
          </FoldSection>
        )}
        {item.NTK_MTHD && (
          <FoldSection heading="먹는 방법">
            <Lines lines={plainLines(item.NTK_MTHD)} />
          </FoldSection>
        )}
        {item.IFTKN_ATNT_MATR_CN && (
          <FoldSection heading="주의할 점">
            <Lines lines={plainLines(item.IFTKN_ATNT_MATR_CN)} />
          </FoldSection>
        )}
        {rawmtrl && (
          <FoldSection heading="들어간 재료">
            <p className="detail-text">{rawmtrl}</p>
          </FoldSection>
        )}
      </div>

      <h2 className="group-label">TV에서 들은 성분</h2>
      <div className="folds">
        <FoldSection heading="이 성분 들어 있나요?">
          <IngredientCheck item={item} />
        </FoldSection>
      </div>

      {shop && (
        <section>
          <h2 className="group-label">가격 보기</h2>
          <div className="group">
            <a className="row" href={shop.naver} target="_blank" rel="noopener noreferrer">
              <span className="row__body row__title">네이버에서 가격 보기</span>
              <ExternalLink className="row__chev" aria-hidden="true" />
            </a>
            <a className="row" href={shop.coupang} target="_blank" rel="noopener noreferrer">
              <span className="row__body row__title">쿠팡에서 가격 보기</span>
              <ExternalLink className="row__chev" aria-hidden="true" />
            </a>
          </div>
          <p className="group-note">
            제품 이름으로 쇼핑몰 검색 결과를 새 창에서 열어요. 판매 이름이 조금 다를 수&nbsp;있어요.
          </p>
        </section>
      )}

      {(meta.length > 0 || item.STDR_STND) && (
        <>
          <h2 className="group-label">더 알아보기</h2>
          <div className="folds">
            <FoldSection heading="신고 번호와 품질 기준">
              {meta.length > 0 && <MetaList items={meta} />}
              {item.STDR_STND && (
                <>
                  <h3 className="detail-subhead">품질 기준</h3>
                  <p className="detail-text">{paragraphToReadable(item.STDR_STND)}</p>
                </>
              )}
            </FoldSection>
          </div>
        </>
      )}
    </article>
  )
}

/** 식약처 회수 목록과 대조. 일치할 때만 빨간 표시 (일치 없음은 "안전"이 아니므로 아무것도 안 보인다) */
function RecallNotice({ item }: { item: HealthFoodItem }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'done'; recall?: RecallItem }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchRecalls()
      .then((recalls) => {
        if (!cancelled) setState({ status: 'done', recall: findRecall(item, recalls) })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [item])

  if (state.status === 'error') {
    return <p className="group-note recall-failed">회수 이력을 확인하지 못했어요. 잠시 후 다시 열어&nbsp;보세요.</p>
  }
  if (state.status !== 'done' || !state.recall) return null
  return (
    <div className="notice notice--error recall" role="alert">
      <TriangleAlert aria-hidden="true" />
      <span>
        <b className="recall__title">식약처 회수 이력이 있는 제품이에요</b>
        {state.recall.RTRVLPRVNS && <>회수 사유: {state.recall.RTRVLPRVNS}<br /></>}
        드시기 전에 약사와 상담해&nbsp;주세요.
      </span>
    </div>
  )
}

/* ──────────────── 보조 컴포넌트 ──────────────── */

function DetailSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="group-label">{heading}</h2>
      <div className="group detail-box">{children}</div>
    </section>
  )
}

/** 제목 줄을 누르면 펼쳐지는 원문 묶음. 처음에는 접혀 있다 */
function FoldSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <details className="fold">
      <summary className="fold__head">{heading}</summary>
      <div className="fold__body">{children}</div>
    </details>
  )
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} className="detail-text">
          {line}
        </p>
      ))}
    </>
  )
}

const DONT_HEAD = 5 // 빨간 상자에 바로 보이는 줄 수. 나머지는 "더 보기"로

/** 한눈에 보기 칸: 묻는 말 제목과 아이콘. 제목은 우리 말이고, 아래 글은 식약처 원문 그대로다 */
const GLANCE_ROW = {
  use: { title: '어디에 먹나요?', Icon: HeartPulse, tone: '' },
  helps: { title: '어디에 도움이 되나요?', Icon: HeartPulse, tone: '' },
  how: { title: '어떻게 먹나요?', Icon: Clock, tone: '' },
  caution: { title: '주의할 점이 있나요?', Icon: CircleAlert, tone: ' glance__icon--caution' },
} as const
type GlanceKind = keyof typeof GLANCE_ROW

/** 원문 한 줄. 소제목 줄은 굵게, 먹는 법은 횟수와 양에 형광펜. 글자는 바꾸지 않는다 */
function GlanceLine({ line, mark }: { line: string; mark: boolean }) {
  if (isSubheadLine(line)) return <p className="glance__sub">{line}</p>
  if (!mark) return <p className="glance__line">{line}</p>
  return (
    <p className="glance__line">
      {markDose(line).map((piece, i) =>
        piece.mark ? (
          <mark key={i} className="glance__mark">
            {piece.text}
          </mark>
        ) : (
          piece.text
        ),
      )}
    </p>
  )
}

/**
 * 한눈에 보기: 식약처 원문 앞부분을 줄 단위로 그대로 옮긴다(지어내지 않는다).
 * "…하지 말 것" 항목은 빨간 상자로 따로 보인다.
 */
function Glance({
  rows,
  dont,
}: {
  rows: { kind: GlanceKind; lines: string[]; more: boolean }[]
  dont?: { title: string; items: string[] } | null
}) {
  const shown = rows.filter((r) => r.lines.length > 0)
  if (shown.length === 0 && !dont) return null
  const head = dont?.items.slice(0, DONT_HEAD) ?? []
  const rest = dont?.items.slice(DONT_HEAD) ?? []
  return (
    <section>
      <h2 className="group-label">한눈에 보기</h2>
      {shown.length > 0 && (
        <div className="group detail-box glance">
          {shown.map((r) => {
            const { title, Icon, tone } = GLANCE_ROW[r.kind]
            return (
              <div key={r.kind} className="glance__row">
                <h3 className="glance__head">
                  <span className={`glance__icon${tone}`} aria-hidden="true">
                    <Icon />
                  </span>
                  {title}
                </h3>
                {r.lines.map((line, i) => (
                  <GlanceLine key={i} line={line} mark={r.kind === 'how'} />
                ))}
              </div>
            )
          })}
          <p className="glance__note">
            식약처 원문{shown.some((r) => r.more) ? '의 앞부분' : ''}을 그대로 옮겼어요. 전체는 아래 원문에서 볼
            수&nbsp;있어요.
          </p>
        </div>
      )}
      {dont && (
        <div className="dont-box">
          <p className="dont-box__title">
            <CircleAlert aria-hidden="true" />
            <span>{dont.title}</span>
          </p>
          {head.length > 0 && (
            <ul className="dont-box__list">
              {head.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {rest.length > 0 && (
            <details className="disclosure dont-box__more">
              <summary className="disclosure__summary">나머지 {rest.length}줄 더 보기</summary>
              <ul className="dont-box__list">
                {rest.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

function MetaList({ items }: { items: [string, string][] }) {
  return (
    <dl className="meta-list">
      {items.map(([k, v]) => (
        <div key={k} className="meta-list__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function DocBlock({ heading, doc }: { heading: string; doc: ParsedDoc | null }) {
  if (!doc) return null
  if (doc.rawFallback) {
    return (
      <FoldSection heading={heading}>
        <DocNodes nodes={paragraphToNodes(doc.rawFallback)} />
      </FoldSection>
    )
  }
  if (doc.sections.length === 0) return null
  const allEmpty = doc.sections.every(
    // 항목 제목만 있는 원문도 있다(와파린 효능: "1. 정맥혈전증의 예방 및 치료" 등 제목뿐)
    (s) => s.articles.length === 0 || s.articles.every((a) => a.paragraphs.length === 0 && !a.title.trim()),
  )
  if (allEmpty) return null

  return (
    <FoldSection heading={heading}>
      {doc.sections.map((section, si) => (
        <div key={si} className="doc-section">
          {section.title && <h3 className="detail-subhead">{section.title}</h3>}
          {section.articles.map((article, ai) => (
            <div key={ai} className="doc-article">
              {article.title && <p className="doc-article__title">{article.title}</p>}
              {article.paragraphs.map((p, pi) => (
                <DocNodes key={pi} nodes={paragraphToNodes(p)} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </FoldSection>
  )
}

function DocNodes({ nodes }: { nodes: DocNode[] }) {
  if (nodes.length === 0) return null
  return (
    <>
      {nodes.map((node, i) =>
        node.type === 'text' ? (
          <p key={i} className="detail-text">
            {node.content}
          </p>
        ) : (
          <DocTable key={i} rows={node.rows} />
        ),
      )}
    </>
  )
}

function DocTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null
  // 첫 행을 머리로 본다 (간단 추정)
  const [header, ...body] = rows
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            {header.map((cell, ci) => (
              <th key={ci} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "프로바이오틱스 수(개별인정 제 2023-2호)" → 본 이름 + 괄호 안 설명(둘째 줄) */
function splitDoseName(name: string): { main: string; note?: string } {
  const m = name.match(/^(.+?)\s*[(（]([^()（）]+)[)）]\s*$/)
  return m ? { main: m[1], note: m[2] } : { main: name }
}

/** 큰 수는 억·만 단위로: "5,000,000,000(50억)CFU" → "50억 CFU", "5,000,000,000 CFU" → "50억 CFU" */
function formatAmount(amount: string): string {
  const withKorean = amount.match(/^[\d,.\s]+[(（]([^()（）]*[억만][^()（）]*)[)）]\s*(.*)$/)
  if (withKorean) return `${withKorean[1]} ${withKorean[2]}`.trim()
  const m = amount.match(/^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(.*)$/)
  if (!m || m[2]) return amount
  const n = Number(m[1].replace(/,/g, ''))
  const short = (v: number) => String(Math.round(v * 10) / 10)
  if (n >= 1e8) return `${short(n / 1e8)}억 ${m[3]}`.trim()
  if (n >= 1e4) return `${short(n / 1e4)}만 ${m[3]}`.trim()
  return amount
}

function formatDate(yyyymmdd: string | undefined): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd ?? ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function cleanIngrCode(text: string): string {
  return text.replace(/\[[A-Z0-9]+\]/g, '').trim()
}
