import type { CustomerV21BankKey } from './assets'
import { stringFromUnknown } from './value-display-model'

export const paymentBankOptions: { key: CustomerV21BankKey; name: string; vietQrCode: string }[] = [
  { key: 'vietcombank', name: 'Vietcombank', vietQrCode: 'VCB' },
  { key: 'techcombank', name: 'Techcombank', vietQrCode: 'TCB' },
  { key: 'bidv', name: 'BIDV', vietQrCode: 'BIDV' },
  { key: 'mbbank', name: 'MBBank', vietQrCode: 'MB' },
  { key: 'acb', name: 'ACB', vietQrCode: 'ACB' },
  { key: 'vietinbank', name: 'VietinBank', vietQrCode: 'ICB' },
]

export function paymentBankKeyFromUnknown(value: unknown): CustomerV21BankKey | null {
  const key = stringFromUnknown(value)
  return key && paymentBankOptions.some((bank) => bank.key === key) ? key as CustomerV21BankKey : null
}

export function normalizeBankAccountNumber(value: string) {
  return value.replace(/\s+/g, '').trim()
}

export function maskBankAccountNumber(value: string | null) {
  const normalized = normalizeBankAccountNumber(value ?? '')
  return normalized.length >= 4 ? `**** ${normalized.slice(-4)}` : ''
}
