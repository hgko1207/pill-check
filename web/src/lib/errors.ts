import { MissingApiKeyError, NedrugRequestError } from './nedrug-api'
import { FoodSafetyKeyMissingError, FoodSafetyAuthError } from './healthfood-api'
import {
  MedicationLimitError,
  DuplicateMedicationError,
} from './db'

/**
 * 60대 사용자 친화 에러 메시지 변환.
 * - 영문 기술 용어 제거
 * - 다음 행동 제안 포함
 * - 자녀 도움이 필요한 시스템 오류는 명시
 */
export function friendlyError(e: unknown): string {
  if (e instanceof MissingApiKeyError) {
    return '앱 설정이 완료되지 않았어요. 자녀(개발자)에게 알려주세요.'
  }
  if (e instanceof FoodSafetyKeyMissingError) {
    return '영양제 정보 연결이 아직 설정되지 않았어요. 자녀에게 알려주세요. (의약품 검색은 계속 사용 가능)'
  }
  if (e instanceof FoodSafetyAuthError) {
    return '영양제 정보 연결에 문제가 생겼어요. 자녀에게 알려주세요.'
  }
  if (e instanceof NedrugRequestError) {
    if (e.status === 404) return '결과를 찾지 못했어요. 다른 이름으로 다시 시도해주세요.'
    if (e.status === 429) return '잠시 너무 많이 사용하셨어요. 1분 후 다시 시도해주세요.'
    if (e.status >= 500) return '서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.'
    return `정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요. (${e.status})`
  }
  if (e instanceof MedicationLimitError || e instanceof DuplicateMedicationError) {
    return e.message // 이미 친화적 메시지
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) {
      return '인터넷 연결이 불안정해요. 와이파이/데이터 확인 후 다시 시도해주세요.'
    }
    if (msg.includes('aborted') || msg.includes('timeout')) {
      return '응답이 너무 느려요. 잠시 후 다시 시도해주세요.'
    }
    if (msg.includes('json') || msg.includes('parse')) {
      return '응답 형식 오류가 있어요. 잠시 후 다시 시도하거나 자녀에게 알려주세요.'
    }
    return `오류가 발생했어요. 잠시 후 다시 시도해주세요.`
  }
  return '알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요.'
}
