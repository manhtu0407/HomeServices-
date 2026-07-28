import type { LocalDeal } from '@nestscout/shared'

type SePayPayment = NonNullable<LocalDeal['payment']>

export type SePayVietQrPaymentPresentation =
  | {
      expectedAmount: number
      kind: 'ready'
      qrImageUrl: string
      transferContent: string
    }
  | {
      expectedAmount: number | null
      kind: 'instructions_unavailable'
    }
  | {
      expectedAmount: number | null
      kind: 'amount_mismatch'
      receivedAmount: number | null
    }
  | {
      expectedAmount: number | null
      kind: 'received'
      receivedAmount: number | null
    }
  | {
      expectedAmount: number | null
      kind: 'unavailable'
    }

const NESTSCOUT_PAYMENT_CODE_PATTERN = /^NS[A-Z0-9]{24}$/
const VIETQR_ACCOUNT_PATTERN = /^[A-Za-z0-9]{1,19}$/
const VIETQR_BANK_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export function buildSePayVietQrPaymentPresentation({
  imageLoadFailed = false,
  payment,
  paymentRailAvailable = true,
}: {
  imageLoadFailed?: boolean
  payment: SePayPayment
  paymentRailAvailable?: boolean
}): SePayVietQrPaymentPresentation {
  const expectedAmount = safeAmount(payment.grossAmount)
  const receivedAmount = safeAmount(payment.amountReceived)

  if (payment.provider !== 'sepay_vietqr') {
    return { expectedAmount, kind: 'unavailable' }
  }
  if (payment.status === 'amount_mismatch') {
    return { expectedAmount, kind: 'amount_mismatch', receivedAmount }
  }
  if (payment.status === 'received') {
    return { expectedAmount, kind: 'received', receivedAmount }
  }
  if (!paymentRailAvailable) {
    return { expectedAmount, kind: 'unavailable' }
  }
  if (payment.status === 'expired' || payment.status === 'failed') {
    return { expectedAmount, kind: 'unavailable' }
  }

  const instructions = !imageLoadFailed && payment.status === 'vietqr_ready'
    ? verifiedInstructions(payment, expectedAmount)
    : null
  if (!instructions || expectedAmount === null) return { expectedAmount, kind: 'instructions_unavailable' }

  return {
    expectedAmount,
    kind: 'ready',
    qrImageUrl: instructions.qrImageUrl,
    transferContent: instructions.transferContent,
  }
}

function verifiedInstructions(payment: SePayPayment, expectedAmount: number | null) {
  const transferContent = normalizedText(payment.transferContent)
  const paymentCode = normalizedText(payment.paymentCode)
  const qrImageUrl = normalizedText(payment.qrImageUrl)
  if (
    expectedAmount === null ||
    !transferContent ||
    !qrImageUrl ||
    !NESTSCOUT_PAYMENT_CODE_PATTERN.test(transferContent) ||
    (paymentCode !== null && paymentCode !== transferContent)
  ) {
    return null
  }

  try {
    const url = new URL(qrImageUrl)
    const accountNumber = singleQueryValue(url, 'acc')
    const bankCode = singleQueryValue(url, 'bank')
    const amount = singleQueryValue(url, 'amount')
    const description = singleQueryValue(url, 'des')
    if (
      url.origin !== 'https://vietqr.app' ||
      url.pathname !== '/img' ||
      url.username ||
      url.password ||
      !accountNumber ||
      !bankCode ||
      amount !== String(expectedAmount) ||
      description !== transferContent ||
      !VIETQR_ACCOUNT_PATTERN.test(accountNumber) ||
      !VIETQR_BANK_PATTERN.test(bankCode)
    ) {
      return null
    }
  } catch {
    return null
  }

  return { qrImageUrl, transferContent }
}

function safeAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function normalizedText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function singleQueryValue(url: URL, name: string) {
  const values = url.searchParams.getAll(name)
  return values.length === 1 ? values[0] : null
}
