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

export type SeverityLevel = 'danger' | 'warn' | 'safe' | 'unknown'

export interface InteractionResult {
  level: SeverityLevel
  message: string
  matchedDrugItemSeq?: string
  matchedSupplementId?: string
}
