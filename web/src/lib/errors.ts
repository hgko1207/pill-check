import { NedrugRequestError } from './nedrug-api'
import { QuotaExceededError } from './llm'
import { FoodSafetyAuthError } from './healthfood-api'
import { FamilyRequestError } from './family'
import { GoogleSignInError } from './auth'
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
  if (e instanceof FoodSafetyAuthError) {
    return '영양제 정보를 받아 오지 못했어요. 자녀에게 알려 주세요.'
  }
  if (e instanceof NedrugRequestError) {
    if (e.status === 404) return '찾는 제품이 없어요. 다른 이름으로 다시 찾아 보세요.'
    if (e.status === 429) return '잠깐 사이에 너무 많이 찾았어요. 1분 뒤에 다시 해 보세요.'
    if (e.status >= 500) return '식약처 서버가 잠시 응답하지 않아요. 조금 뒤에 다시 해 보세요.'
    return `정보를 받아 오지 못했어요. 조금 뒤에 다시 해 보세요. (오류 ${e.status})`
  }
  if (e instanceof FamilyRequestError) {
    if (e.code === 'invalid_code') {
      return '초대 코드가 맞지 않거나 기한이 지났어요. 코드를 다시 보시고, 계속 안 되면 자녀에게 새 코드를 받아 주세요.'
    }
    if (e.code === 'too_many') return '오늘은 코드를 너무 많이 넣으셨어요. 내일 다시 해 보세요.'
    if (e.code === 'bad_token') return '가족 연결이 끊어졌어요. 자녀에게 새 초대 코드를 받아 주세요.'
    if (e.code === 'login_required') return '가족의 약을 보는 초대예요. Google로 로그인하면 연결돼요.'
    if (e.code === 'bad_session') return '로그인이 끝났어요. 다시 로그인해 주세요.'
    if (e.code === 'bad_credential') return 'Google 로그인을 확인하지 못했어요. 다시 해 보세요.'
    if (e.code === 'forbidden') return '관리자만 할 수 있어요. 관리자에게 부탁해 주세요.'
    if (e.code === 'last_admin') return '관리자가 한 명뿐이라 뺄 수 없어요. 다른 분께 먼저 관리자를 주세요.'
    if (e.status >= 500) return '가족 연결 서버가 잠시 응답하지 않아요. 조금 뒤에 다시 해 보세요.'
    return '가족 연결 중 문제가 생겼어요. 조금 뒤에 다시 해 보시고, 계속되면 자녀에게 알려 주세요.'
  }
  if (e instanceof GoogleSignInError) {
    return 'Google 로그인 화면을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 해 보세요.'
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
