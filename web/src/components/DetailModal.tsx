import { useEffect } from 'react'
import type { NedrugItem } from '../lib/types'
import type { HealthFoodItem } from '../lib/healthfood-api'
import { parseDoc, type ParsedDoc } from '../lib/xmlDoc'

export type DetailTarget =
  | { kind: 'drug'; raw: NedrugItem }
  | { kind: 'healthfood'; raw: HealthFoodItem }
  | null

interface Props {
  target: DetailTarget
  onClose: () => void
}

export function DetailModal({ target, onClose }: Props) {
  // ESC 키로 닫기
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
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="닫기"
        >
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

function DrugDetail({ item }: { item: NedrugItem }) {
  const cancelled = !!item.CANCEL_DATE
  const ee = parseDoc(item.EE_DOC_DATA)
  const ud = parseDoc(item.UD_DOC_DATA)
  const nb = parseDoc(item.NB_DOC_DATA)

  return (
    <article className="modal-content">
      <div className="badge badge--drug">💊 의약품</div>
      {cancelled && (
        <div className="badge badge--cancelled" style={{ marginLeft: 6 }}>
          🚫 시판 중단 ({formatDate(item.CANCEL_DATE)})
        </div>
      )}

      <h2 className="modal-title">{item.ITEM_NAME ?? '(이름 없음)'}</h2>

      <dl className="modal-meta">
        {item.ETC_OTC_CODE && <Meta label="분류" value={item.ETC_OTC_CODE} />}
        {item.ENTP_NAME && <Meta label="제조사" value={item.ENTP_NAME} />}
        {item.MAIN_ITEM_INGR && (
          <Meta label="주성분" value={cleanIngrCode(item.MAIN_ITEM_INGR)} />
        )}
        {item.CHART && <Meta label="모양·색상" value={item.CHART} />}
        {item.STORAGE_METHOD && <Meta label="보관" value={item.STORAGE_METHOD} />}
        {item.VALID_TERM && <Meta label="유효기간" value={item.VALID_TERM} />}
        {item.PACK_UNIT && <Meta label="포장" value={item.PACK_UNIT} />}
      </dl>

      {cancelled && (
        <section className="modal-warn">
          이 약은 식약처에 의해 <b>{formatDate(item.CANCEL_DATE)}</b>에{' '}
          {item.CANCEL_NAME ?? '취하'}되었습니다. 부모님 약 등록 전에 약사·의사와
          상담하세요.
        </section>
      )}

      <DocBlock heading="💊 효능·효과" doc={ee} />
      <DocBlock heading="📅 용법·용량" doc={ud} />
      <DocBlock heading="⚠️ 사용 시 주의사항" doc={nb} />

      {item.INGR_NAME && (
        <DetailSection heading="📋 전체 성분 (첨가제 포함)">
          <p className="modal-text">{cleanIngrCode(item.INGR_NAME)}</p>
        </DetailSection>
      )}
    </article>
  )
}

function HealthFoodDetail({ item }: { item: HealthFoodItem }) {
  const rawmtrl = [item.RAWMTRL_NM, item.ETC_RAWMTRL_NM, item.INDIV_RAWMTRL_NM]
    .filter(Boolean)
    .join(', ')

  return (
    <article className="modal-content">
      <div className="badge badge--healthfood">🌿 영양제</div>

      <h2 className="modal-title">{item.PRDLST_NM ?? '(이름 없음)'}</h2>

      <dl className="modal-meta">
        {item.BSSH_NM && <Meta label="업체" value={item.BSSH_NM} />}
        {item.PRDT_SHAP_CD_NM && <Meta label="형태" value={item.PRDT_SHAP_CD_NM} />}
        {item.POG_DAYCNT && <Meta label="소비기한" value={item.POG_DAYCNT} />}
        {item.PRMS_DT && <Meta label="허가일자" value={formatDate(item.PRMS_DT)} />}
        {item.PRDLST_REPORT_NO && <Meta label="품목제조번호" value={item.PRDLST_REPORT_NO} />}
      </dl>

      {item.PRIMARY_FNCLTY && (
        <DetailSection heading="✨ 주된 기능성">
          <p className="modal-text">{item.PRIMARY_FNCLTY}</p>
        </DetailSection>
      )}

      {item.NTK_MTHD && (
        <DetailSection heading="📅 섭취방법">
          <p className="modal-text">{item.NTK_MTHD}</p>
        </DetailSection>
      )}

      {item.IFTKN_ATNT_MATR_CN && (
        <DetailSection heading="⚠️ 섭취 시 주의사항">
          <p className="modal-text">{item.IFTKN_ATNT_MATR_CN}</p>
        </DetailSection>
      )}

      {rawmtrl && (
        <DetailSection heading="🌱 원료">
          <p className="modal-text">{rawmtrl}</p>
        </DetailSection>
      )}

      {item.STDR_STND && (
        <DetailSection heading="📐 기준규격">
          <p className="modal-text">{item.STDR_STND}</p>
        </DetailSection>
      )}
    </article>
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

function DetailSection({ heading, children }: { heading: string; children: React.ReactNode }) {
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
        <p className="modal-text">{doc.rawFallback}</p>
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
                <p key={pi} className="modal-text">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      ))}
    </DetailSection>
  )
}

function formatDate(yyyymmdd: string | undefined): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd ?? ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function cleanIngrCode(text: string): string {
  // [M081434]와파린나트륨 → 와파린나트륨
  return text.replace(/\[[A-Z0-9]+\]/g, '').trim()
}
