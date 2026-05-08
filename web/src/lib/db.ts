import Dexie, { type Table } from 'dexie'

export interface RegisteredMedication {
  id?: number
  itemSeq: string
  itemName: string
  manufacturer?: string
  mainIngredient?: string
  registeredAt: number
}

class PillCheckDB extends Dexie {
  medications!: Table<RegisteredMedication, number>

  constructor() {
    super('pillcheck')
    this.version(1).stores({
      medications: '++id, itemSeq, itemName, registeredAt',
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
