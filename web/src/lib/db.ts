import Dexie, { type Table } from 'dexie'

export type MedicationKind = 'drug' | 'healthfood'

export interface RegisteredMedication {
  id?: number
  /** 처방약(drug) 또는 영양제(healthfood) — V2부터 추가, V1 기존 데이터는 마이그레이션에서 'drug' 부여 */
  kind: MedicationKind
  /** 식별자 — drug: 식약처 ITEM_SEQ / healthfood: PRDLST_REPORT_NO 또는 PRMS_DT */
  itemSeq: string
  itemName: string
  manufacturer?: string
  /** drug: MAIN_ITEM_INGR/MAIN_INGR · healthfood: RAWMTRL_NM (원료성분) */
  mainIngredient?: string
  registeredAt: number
}

class PillCheckDB extends Dexie {
  medications!: Table<RegisteredMedication, number>

  constructor() {
    super('pillcheck')

    // V1: kind 필드 없음
    this.version(1).stores({
      medications: '++id, itemSeq, itemName, registeredAt',
    })

    // V2: kind 필드 추가 — 기존 데이터는 모두 'drug'로 마이그레이션
    this.version(2)
      .stores({
        medications: '++id, itemSeq, itemName, registeredAt, kind',
      })
      .upgrade((tx) => {
        return tx
          .table<RegisteredMedication>('medications')
          .toCollection()
          .modify((med) => {
            if (!med.kind) med.kind = 'drug'
          })
      })
  }
}

export const db = new PillCheckDB()

export const MAX_MEDICATIONS = 10

export async function listMedications(): Promise<RegisteredMedication[]> {
  return db.medications.orderBy('registeredAt').toArray()
}

export class MedicationLimitError extends Error {
  constructor() {
    super(`등록 가능한 약은 최대 ${MAX_MEDICATIONS}개입니다. 기존 약을 정리한 후 추가하세요.`)
    this.name = 'MedicationLimitError'
  }
}

export class DuplicateMedicationError extends Error {
  constructor() {
    super('이미 등록된 약입니다.')
    this.name = 'DuplicateMedicationError'
  }
}

export async function addMedication(
  med: Omit<RegisteredMedication, 'id' | 'registeredAt'>,
): Promise<number> {
  const count = await db.medications.count()
  if (count >= MAX_MEDICATIONS) throw new MedicationLimitError()

  const existing = await db.medications.where('itemSeq').equals(med.itemSeq).first()
  if (existing) throw new DuplicateMedicationError()

  return db.medications.add({
    ...med,
    registeredAt: Date.now(),
  })
}

export async function removeMedication(id: number): Promise<void> {
  await db.medications.delete(id)
}

export async function clearAllMedications(): Promise<number> {
  const count = await db.medications.count()
  await db.medications.clear()
  return count
}
