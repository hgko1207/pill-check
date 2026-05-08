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
