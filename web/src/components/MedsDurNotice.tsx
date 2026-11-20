import { AlertCircle } from 'lucide-react'
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

/**
 * 한 사람의 약끼리 병용금기 안내 (가족 탭 plan.md 56, 내 약 탭 plan.md 61).
 * 충돌이 없으면 아무것도 띄우지 않는다 — 초록으로 "괜찮다"고 단정하지 않는다.
 */
export function MedsDurNotice({ result, page = false, onRetry }: Props) {
  if (!result) return null
  const { conflicts, unchecked } = result
  const where = page ? ' family-dur--page' : ''
  return (
    <>
      {conflicts.length > 0 && (
        <div className={`family-dur family-dur--danger${where}`} role="note">
          <AlertCircle aria-hidden="true" />
          <div>
            <b>함께 드시면 안 되는 약이 있어요</b>
            <ul className="family-dur__pairs">
              {conflicts.map((c) => (
                <li key={`${c.aKey}|${c.bKey}`}>{pairLabel(c.aName, c.bName)}</li>
              ))}
            </ul>
            <span className="family-dur__next">식약처 자료 기준 참고용이에요. 약사에게 물어봐 주세요.</span>
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
