import type { CustomerV21BankKey } from '../ui/assets'
import { stringFromUnknown } from '../ui/value-display-model'

export const paymentBankOptions: { key: CustomerV21BankKey; name: string; vietQrCode: string }[] = [
  { key: 'vietcombank', name: 'Vietcombank', vietQrCode: 'VCB' },
  { key: 'techcombank', name: 'Techcombank', vietQrCode: 'TCB' },
  { key: 'bidv', name: 'BIDV', vietQrCode: 'BIDV' },
  { key: 'mbbank', name: 'MBBank', vietQrCode: 'MB' },
  { key: 'acb', name: 'ACB', vietQrCode: 'ACB' },
  { key: 'vietinbank', name: 'VietinBank', vietQrCode: 'ICB' },
]

const paymentBankFullNames: Record<string, string> = {
  ACB: 'Ngân hàng Á Châu',
  BIDV: 'Ngân hàng Đầu tư và Phát triển Việt Nam',
  ICB: 'Ngân hàng Công Thương Việt Nam',
  MB: 'Ngân hàng Quân đội',
  TCB: 'Ngân hàng Kỹ thương Việt Nam',
  VCB: 'Ngân hàng Ngoại thương Việt Nam',
}

// The full bank name for a VietQR code, or null when the code is not one the app knows.
export function paymentBankFullName(vietQrCode: string | null | undefined) {
  return paymentBankFullNames[vietQrCode?.trim().toUpperCase() ?? ''] ?? null
}

export function paymentBankKeyFromUnknown(value: unknown): CustomerV21BankKey | null {
  const key = stringFromUnknown(value)
  return key && paymentBankOptions.some((bank) => bank.key === key) ? key as CustomerV21BankKey : null
}

export function normalizeBankAccountNumber(value: string) {
  return value.replace(/\s+/g, '').trim()
}
