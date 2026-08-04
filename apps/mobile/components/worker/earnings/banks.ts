import type { ImageSourcePropType } from 'react-native'

export type WorkerV5BankLogoName = 'acb' | 'bidv' | 'mbbank' | 'techcombank' | 'vietcombank' | 'vietinbank'

export const workerV5BankLogos: Record<WorkerV5BankLogoName, ImageSourcePropType> = {
  acb: require('@/assets/banks/acb.png') as ImageSourcePropType,
  bidv: require('@/assets/banks/bidv.png') as ImageSourcePropType,
  mbbank: require('@/assets/banks/mbbank.png') as ImageSourcePropType,
  techcombank: require('@/assets/banks/techcombank.png') as ImageSourcePropType,
  vietcombank: require('@/assets/banks/vietcombank.png') as ImageSourcePropType,
  vietinbank: require('@/assets/banks/vietinbank.png') as ImageSourcePropType,
}

export const WORKER_V5_BANK_OPTIONS: readonly { code: WorkerV5BankLogoName; label: string }[] = [
  { code: 'vietcombank', label: 'Vietcombank' },
  { code: 'techcombank', label: 'Techcombank' },
  { code: 'bidv', label: 'BIDV' },
  { code: 'mbbank', label: 'MBBank' },
  { code: 'acb', label: 'ACB' },
  { code: 'vietinbank', label: 'VietinBank' },
]

export function resolveWorkerV5BankLogoName(bankName: string | null | undefined): WorkerV5BankLogoName | null {
  const normalized = bankName?.toLowerCase().replace(/\s+/g, '') ?? ''
  if (!normalized) return null
  if (normalized.includes('vietcombank') || normalized.includes('vcb')) return 'vietcombank'
  if (normalized.includes('techcombank') || normalized.includes('tcb')) return 'techcombank'
  if (normalized.includes('vietinbank') || normalized.includes('ctg')) return 'vietinbank'
  if (normalized.includes('mbbank') || normalized === 'mb') return 'mbbank'
  if (normalized.includes('bidv')) return 'bidv'
  if (normalized.includes('acb')) return 'acb'
  return null
}
