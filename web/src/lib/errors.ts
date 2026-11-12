import { MissingApiKeyError, NedrugRequestError } from './nedrug-api'
import { QuotaExceededError } from './llm'
import { FoodSafetyKeyMissingError, FoodSafetyAuthError } from './healthfood-api'
import {
  MedicationLimitError,
  DuplicateMedicationError,
  MAX_MEDICATIONS,
} from './db'

/**
 * 60대 사용자 친화 에러 메시지 변환.
 * - 영문 기술 용어 제거
 * - 다음 행동 제안 포함
 * - 자녀 도움이 필요한 시스템 오류는 명시
 */
export function friendlyError(e: unknown): string {
  if (e instanceof MissingApiKeyError) {
    return '앱 설정이 덜 됐어요. 이 화면을 자녀에게 보여 주세요.'
  }
  if (e instanceof FoodSafetyKeyMissingError) {
    return '영양제는 아직 찾을 수 없어요. 약 검색은 그대로 쓸 수 있어요. 자녀에게 알려 주세요.'
  }
  if (e instanceof FoodSafetyAuthError) {
    return '영양제 정보를 받아 오지 못했어요. 자녀에게 알려 주세요.'
  }
  if (e instanceof NedrugRequestError) {
    if (e.status === 404) return '찾는 제품이 없어요. 다른 이름으로 다시 찾아 보세요.'
    if (e.status === 429) return '잠깐 사이에 너무 많이 찾았어요. 1분 뒤에 다시 해 보세요.'
    if (e.status >= 500) return '식약처 서버가 잠시 응답하지 않아요. 조금 뒤에 다시 해 보세요.'
    return `정보를 받아 오지 못했어요. 조금 뒤에 다시 해 보세요. (오류 ${e.status})`
  }
  if (e instanceof MedicationLimitError) {
    return `내 약은 ${MAX_MEDICATIONS}개까지 등록할 수 있어요. 더 드시지 않는 약을 지운 뒤 추가해 주세요.`
  }
  if (e instanceof DuplicateMedicationError) {
    return '이미 내 약에 있어요.'
  }
  if (e instanceof QuotaExceededError) {
    return '오늘 AI 해설을 다 쓰셨어요. 내일 다시 해 보세요.'
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) {
      return '인터넷 연결이 불안정해요. 와이파이나 데이터가 켜져 있는지 보고 다시 해 보세요.'
    }
    if (msg.includes('aborted') || msg.includes('timeout')) {
      return '응답이 늦어요. 조금 뒤에 다시 해 보세요.'
    }
    if (msg.includes('json') || msg.includes('parse')) {
      return '받은 정보를 읽지 못했어요. 조금 뒤에 다시 해 보시고, 계속되면 자녀에게 알려 주세요.'
    }
    return '문제가 생겼어요. 조금 뒤에 다시 해 보세요.'
  }
  return '문제가 생겼어요. 조금 뒤에 다시 해 보세요.'
}
