export interface NedrugItem {
  ITEM_NAME?: string
  ITEM_SEQ?: string
  ENTP_NAME?: string
  MAIN_INGR?: string
  EE_DOC_DATA?: string
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
