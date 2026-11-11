import { useEffect, useState } from 'react'
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
  type ParsedDoc,
  type DocNode,
} from '../lib/xmlDoc'

export type DetailTarget =
  | { kind: 'drug'; raw: NedrugItem }
  | { kind: 'healthfood'; raw: HealthFoodItem }
  | null

interface Props {
  target: DetailTarget
  onClose: () => void
}

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

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        {target.kind === 'drug' ? (
          <DrugDetail item={target.raw} />
        ) : (
          <HealthFoodDetail item={target.raw} />
        )}
        <p className="modal-disclaimer">
          본 정보는 식품의약품안전처 공공데이터를 기반으로 한 참고 자료입니다.
          의료 행위가 아니며, 약사·의사 상담을 대체하지 않습니다.
        </p>
      </div>
    </div>
  )
}

/* ──────────────── 의약품 상세 ──────────────── */

function DrugDetail({ item }: { item: NedrugItem }) {
  const cancelled = !!item.CANCEL_DATE
  const ee = parseDoc(item.EE_DOC_DATA)
  const ud = parseDoc(item.UD_DOC_DATA)
  const nb = parseDoc(item.NB_DOC_DATA)

  const classification = item.ETC_OTC_CODE
  const manufacturer = item.ENTP_NAME
  const mainIngr = item.MAIN_ITEM_INGR ? cleanIngrCode(item.MAIN_ITEM_INGR) : null

  return (
    <article className="modal-content">
      {/* 요약 영역 */}
      <header className="summary">
        <div className="summary__badges">
          <span className="badge badge--drug">의약품</span>
          {classification && <span className="badge badge--neutral">{classification}</span>}
          {cancelled && (
            <span className="badge badge--cancelled">
              🚫 시판 중단 ({formatDate(item.CANCEL_DATE)})
            </span>
          )}
        </div>
        <h2 className="modal-title">{item.ITEM_NAME ?? '(이름 없음)'}</h2>
        {(manufacturer || mainIngr) && (
          <dl className="summary__quick">
            {manufacturer && <SummaryItem label="제조사" value={manufacturer} />}
            {mainIngr && <SummaryItem label="주성분" value={mainIngr} />}
          </dl>
        )}
      </header>

      {cancelled && (
        <section className="modal-warn">
          이 약은 식약처에 의해 <b>{formatDate(item.CANCEL_DATE)}</b>에{' '}
          {item.CANCEL_NAME ?? '취하'}되었습니다. 등록 전에 약사·의사와 상담하세요.
        </section>
      )}

      {/* 핵심 정보 — 항상 펼침 */}
      <DocBlock heading="효능·효과" doc={ee} />
      <DocBlock heading="용법·용량" doc={ud} />
      <DocBlock heading="사용 시 주의사항" doc={nb} />

      {/* 더 자세히 — 기본 접힘 */}
      <details className="more-details">
        <summary className="more-details__summary">더 자세히 보기</summary>
        <dl className="modal-meta">
          {item.CHART && <Meta label="모양·색상" value={paragraphToReadable(item.CHART)} />}
          {item.STORAGE_METHOD && (
            <Meta label="보관" value={paragraphToReadable(item.STORAGE_METHOD)} />
          )}
          {item.VALID_TERM && <Meta label="유효기간" value={paragraphToReadable(item.VALID_TERM)} />}
          {item.PACK_UNIT && <Meta label="포장" value={paragraphToReadable(item.PACK_UNIT)} />}
          {item.ATC_CODE && <Meta label="ATC 코드" value={item.ATC_CODE} />}
          {item.ITEM_PERMIT_DATE && (
            <Meta label="허가일" value={formatDate(item.ITEM_PERMIT_DATE)} />
          )}
        </dl>
        {item.INGR_NAME && (
          <div className="more-details__ingr">
            <h4 className="more-details__ingr-title">전체 성분 (첨가제 포함)</h4>
            <p className="modal-text">{cleanIngrCode(paragraphToReadable(item.INGR_NAME))}</p>
          </div>
        )}
      </details>
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

  return (
    <article className="modal-content">
      <header className="summary">
        <div className="summary__badges">
          <span className="badge badge--healthfood">영양제</span>
          {item.PRDT_SHAP_CD_NM && (
            <span className="badge badge--neutral">{item.PRDT_SHAP_CD_NM}</span>
          )}
        </div>
        <h2 className="modal-title">{item.PRDLST_NM ?? '(이름 없음)'}</h2>
        {item.BSSH_NM && (
          <dl className="summary__quick">
            <SummaryItem label="제조" value={item.BSSH_NM} />
          </dl>
        )}
      </header>

      <RecallNotice item={item} />

      <DetailSection heading="TV에서 들은 성분 확인">
        <IngredientCheck item={item} />
      </DetailSection>

      {item.PRIMARY_FNCLTY && (
        <DetailSection heading="주된 기능성">
          <p className="modal-text">{paragraphToReadable(item.PRIMARY_FNCLTY)}</p>
        </DetailSection>
      )}

      {doses.length > 0 && (
        <DetailSection heading="함량">
          <ul className="dose-list">
            {doses.map((d, i) => (
              <li key={i} className="dose-list__item">
                <span className="dose-list__name">{d.name}</span>
                <span className="dose-list__amount">
                  {d.amount}
                  {d.per && <span className="dose-list__per"> (제품 {d.per}당)</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="dose-list__note">식약처에 신고한 표시량이에요.</p>
        </DetailSection>
      )}

      {item.NTK_MTHD && (
        <DetailSection heading="섭취 방법">
          <p className="modal-text">{paragraphToReadable(item.NTK_MTHD)}</p>
        </DetailSection>
      )}

      {item.IFTKN_ATNT_MATR_CN && (
        <DetailSection heading="섭취 시 주의사항">
          <p className="modal-text">{paragraphToReadable(item.IFTKN_ATNT_MATR_CN)}</p>
        </DetailSection>
      )}

      {rawmtrl && (
        <DetailSection heading="원료">
          <p className="modal-text">{rawmtrl}</p>
        </DetailSection>
      )}

      {shop && (
        <DetailSection heading="가격 보기">
          <div className="shop-links">
            <a className="btn btn--secondary shop-links__btn" href={shop.naver} target="_blank" rel="noopener noreferrer">
              네이버에서 가격 보기
            </a>
            <a className="btn btn--secondary shop-links__btn" href={shop.coupang} target="_blank" rel="noopener noreferrer">
              쿠팡에서 가격 보기
            </a>
          </div>
          <p className="dose-list__note">제품 이름으로 쇼핑몰 검색 결과를 새 창에서 열어요. 판매 이름이 조금 다를 수 있어요.</p>
        </DetailSection>
      )}

      <details className="more-details">
        <summary className="more-details__summary">더 자세히 보기</summary>
        <dl className="modal-meta">
          {item.POG_DAYCNT && <Meta label="소비기한" value={item.POG_DAYCNT} />}
          {item.PRMS_DT && <Meta label="허가일자" value={formatDate(item.PRMS_DT)} />}
          {item.PRDLST_REPORT_NO && (
            <Meta label="품목제조번호" value={item.PRDLST_REPORT_NO} />
          )}
          {item.LCNS_NO && <Meta label="인허가번호" value={item.LCNS_NO} />}
        </dl>
        {item.STDR_STND && (
          <div className="more-details__ingr">
            <h4 className="more-details__ingr-title">기준규격</h4>
            <p className="modal-text">{paragraphToReadable(item.STDR_STND)}</p>
          </div>
        )}
      </details>
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
    return <p className="recall-check-failed">회수 이력을 확인하지 못했어요. 잠시 후 다시 열어 보세요.</p>
  }
  if (state.status !== 'done' || !state.recall) return null
  return (
    <section className="modal-warn modal-warn--danger" role="alert">
      🚨 <b>식약처 회수 이력이 있는 제품이에요.</b>
      {state.recall.RTRVLPRVNS && (
        <>
          <br />
          회수 사유: {state.recall.RTRVLPRVNS}
        </>
      )}
      <br />
      드시기 전에 약사와 상담하세요.
    </section>
  )
}

/* ──────────────── 보조 컴포넌트 ──────────────── */

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary__quick-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function DetailSection({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="modal-section">
      <h3 className="modal-section__heading">{heading}</h3>
      {children}
    </section>
  )
}

function DocBlock({ heading, doc }: { heading: string; doc: ParsedDoc | null }) {
  if (!doc) return null
  if (doc.rawFallback) {
    return (
      <DetailSection heading={heading}>
        <DocNodes nodes={paragraphToNodes(doc.rawFallback)} />
      </DetailSection>
    )
  }
  if (doc.sections.length === 0) return null
  const allEmpty = doc.sections.every(
    (s) => s.articles.length === 0 || s.articles.every((a) => a.paragraphs.length === 0),
  )
  if (allEmpty) return null

  return (
    <DetailSection heading={heading}>
      {doc.sections.map((section, si) => (
        <div key={si} className="doc-section">
          {section.title && <h4 className="doc-section__title">{section.title}</h4>}
          {section.articles.map((article, ai) => (
            <div key={ai} className="doc-article">
              {article.title && <div className="doc-article__title">{article.title}</div>}
              {article.paragraphs.map((p, pi) => (
                <DocNodes key={pi} nodes={paragraphToNodes(p)} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </DetailSection>
  )
}

function DocNodes({ nodes }: { nodes: DocNode[] }) {
  if (nodes.length === 0) return null
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'text') {
          return (
            <p key={i} className="modal-text">
              {node.content}
            </p>
          )
        }
        // table
        return <DocTable key={i} rows={node.rows} />
      })}
    </>
  )
}

function DocTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null
  // 첫 행을 헤더로 추정 (간단 휴리스틱)
  const [header, ...body] = rows
  return (
    <div className="dur-table-wrap">
      <table className="dur-table">
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

function formatDate(yyyymmdd: string | undefined): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd ?? ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function cleanIngrCode(text: string): string {
  return text.replace(/\[[A-Z0-9]+\]/g, '').trim()
}
