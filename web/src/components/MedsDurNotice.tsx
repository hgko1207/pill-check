import { AlertCircle, TriangleAlert } from 'lucide-react'
import { type AmongResult } from '../lib/dur'

/** "노바스크정5밀리그램(암로디핀베실산염)" → "노바스크정5밀리그램" */
export function shortMedName(name: string): string {
  return name.replace(/\([^)]*\)/g, '').trim() || name
}

/** 이름 뒤 '와'/'과' (받침 있으면 '과'). 한글로 끝나지 않으면 '+' */
export function andParticle(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00
  if (code < 0 || code > 11171) return ' +'
  return code % 28 === 0 ? '와' : '과'
}

/** "A와 B" (괄호 뺀 이름) */
export function pairLabel(aName: string, bName: string): string {
  const a = shortMedName(aName)
  return `${a}${andParticle(a)} ${shortMedName(bName)}`
}

interface Props {
  result: AmongResult | undefined
  /** 내 약 탭: 화면 폭 여백, 회색 안내에 "다시 확인" 버튼 */
  page?: boolean
  onRetry?: () => void
}

/** 약 줄 끝 표시: 병용금기 짝이 있으면 "확인 필요"(빨강), 효능군중복만 있으면 "주의 필요"(노랑) */
export function MedFlag({ result, kind, itemSeq }: { result: AmongResult | undefined; kind: string; itemSeq: string }) {
  const key = `${kind}:${itemSeq}`
  const mine = result?.conflicts.filter((c) => c.aKey === key || c.bKey === key) ?? []
  if (mine.length === 0) return null
  return mine.some((c) => c.severity === 'danger') ? (
    <span className="status status--danger family-meds__flag">확인 필요</span>
  ) : (
    <span className="status status--warn family-meds__flag">주의 필요</span>
  )
}

/**
 * 한 사람의 약끼리 안내 (가족 탭 plan.md 56, 내 약 탭 plan.md 61).
 * 병용금기 짝은 빨강, 같은 효능군·계열 짝은 노랑(plan.md 64).
 * 충돌이 없으면 아무것도 띄우지 않는다 — 초록으로 "괜찮다"고 단정하지 않는다.
 */
export function MedsDurNotice({ result, page = false, onRetry }: Props) {
  if (!result) return null
  const { unchecked } = result
  const danger = result.conflicts.filter((c) => c.severity === 'danger')
  const warn = result.conflicts.filter((c) => c.severity === 'warn')
  const where = page ? ' family-dur--page' : ''
  return (
    <>
      {danger.length > 0 && (
        <div className={`family-dur family-dur--danger${where}`} role="note">
          <AlertCircle aria-hidden="true" />
          <div>
            <b>함께 드시면 안 되는 약이 있어요</b>
            <ul className="family-dur__pairs">
              {danger.map((c) => (
                <li key={`${c.aKey}|${c.bKey}`}>{pairLabel(c.aName, c.bName)}</li>
              ))}
            </ul>
            <span className="family-dur__next">식약처 자료 기준 참고용이에요. 약사에게 물어봐 주세요.</span>
          </div>
        </div>
      )}
      {warn.length > 0 && (
        <div className={`family-dur family-dur--warn${where}`} role="note">
          <TriangleAlert aria-hidden="true" />
          <div>
            <b>같은 종류의 약이 겹쳐요</b>
            <ul className="family-dur__pairs">
              {warn.map((c) => (
                <li key={`${c.aKey}|${c.bKey}|w`}>
                  {pairLabel(c.aName, c.bName)}
                  {c.group && ` (${c.group})`}
                </li>
              ))}
            </ul>
            <span className="family-dur__next">함께 드셔도 되는지 약사에게 물어봐 주세요.</span>
          </div>
        </div>
      )}
      {unchecked > 0 && (
        <div className={`family-dur family-dur--unknown${where}`} role="note">
          <AlertCircle aria-hidden="true" />
          {onRetry ? (
            <div>
              <span>일부 약은 함께 드셔도 되는지 확인하지 못했어요.</span>
              <button type="button" className="btn btn--secondary btn--small family-dur__retry" onClick={onRetry}>
                다시 확인
              </button>
            </div>
          ) : (
            <span>일부 약은 함께 드셔도 되는지 확인하지 못했어요. 새로 고침해 다시 확인해 주세요.</span>
          )}
        </div>
      )}
    </>
  )
}
