export interface NedrugItem {
  ITEM_NAME?: string
  ITEM_SEQ?: string
  ENTP_NAME?: string
  ETC_OTC_CODE?: string // 전문의약품 / 일반의약품
  CHART?: string // 제품 모양·색상
  MATERIAL_NAME?: string // 총량·성분 상세
  MAIN_INGR?: string // 주성분 영문
  MAIN_ITEM_INGR?: string // 주성분 한글 (예: [M081434]와파린나트륨)
  INGR_NAME?: string // 첨가제 등 모든 성분 한글
  EE_DOC_DATA?: string // 효능·효과 (XML)
  UD_DOC_DATA?: string // 용법·용량 (XML)
  NB_DOC_DATA?: string // 사용상의주의사항 (XML)
  STORAGE_METHOD?: string
  VALID_TERM?: string
  PACK_UNIT?: string
  ATC_CODE?: string
  ITEM_PERMIT_DATE?: string
  CANCEL_DATE?: string // 취하일자 (있으면 시판 중단)
  CANCEL_NAME?: string // 취하 사유
  TOTAL_CONTENT?: string
  BAR_CODE?: string
}

export interface NedrugSearchResponse {
  body?: {
    items?: NedrugItem[]
    totalCount?: number
  }
}

export type SearchResultKind = 'drug' | 'healthfood'

export interface UnifiedSearchResult {
  kind: SearchResultKind
  /** kind 내 고유 ID (등록·dedup용). drug=ITEM_SEQ, healthfood=품목제조관리번호 또는 신고번호 */
  id: string
  name: string
  manufacturer?: string
  ingredient?: string
}

export type SeverityLevel = 'danger' | 'warn' | 'safe' | 'unknown'

export interface InteractionDetail {
  registeredMedName: string
  conflictWith: string
  severity: SeverityLevel
  source: string
  prohbtContent?: string
}

export interface InteractionResult {
  level: SeverityLevel
  title: string
  message: string
  details?: InteractionDetail[]
}
