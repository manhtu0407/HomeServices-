import type { LocalDeal } from '@nestscout/shared'

import { buildSePayVietQrPaymentPresentation } from '../v21/sepay-vietqr-payment-display-model'

describe('SePay VietQR payment presentation', () => {
  it('exposes payment instructions only when the server payment data and QR URL agree', () => {
    const payment = paymentFixture()

    expect(buildSePayVietQrPaymentPresentation({ payment })).toEqual({
      expectedAmount: 450_000,
      kind: 'ready',
      qrImageUrl: payment.qrImageUrl,
      transferContent: payment.transferContent,
    })
  })

  it('withholds a QR whose amount or transfer content differs from the server payment', () => {
    const amountMismatch = paymentFixture({
      qrImageUrl: paymentQrUrl({ amount: 450_001 }),
    })
    const contentMismatch = paymentFixture({
      qrImageUrl: paymentQrUrl({ paymentCode: 'NSABCDEF1234567890ABCDEF12' }),
    })

    expect(buildSePayVietQrPaymentPresentation({ payment: amountMismatch })).toMatchObject({
      expectedAmount: 450_000,
      kind: 'instructions_unavailable',
    })
    expect(buildSePayVietQrPaymentPresentation({ payment: contentMismatch })).toMatchObject({
      expectedAmount: 450_000,
      kind: 'instructions_unavailable',
    })
  })

  it('does not keep the original QR available after the provider reports an amount mismatch', () => {
    const payment = paymentFixture({
      amountReceived: 400_000,
      status: 'amount_mismatch',
    })

    expect(buildSePayVietQrPaymentPresentation({ payment })).toEqual({
      expectedAmount: 450_000,
      kind: 'amount_mismatch',
      receivedAmount: 400_000,
    })
  })

  it('withholds the QR after its image fails to load', () => {
    expect(buildSePayVietQrPaymentPresentation({
      imageLoadFailed: true,
      payment: paymentFixture(),
    })).toMatchObject({
      kind: 'instructions_unavailable',
    })
  })

  it('fails closed when the payment rail is no longer available', () => {
    expect(buildSePayVietQrPaymentPresentation({
      payment: paymentFixture(),
      paymentRailAvailable: false,
    })).toMatchObject({
      kind: 'unavailable',
    })
  })

  it('keeps an amount mismatch visible when the rail is disabled after the transfer', () => {
    expect(buildSePayVietQrPaymentPresentation({
      payment: paymentFixture({ amountReceived: 400_000, status: 'amount_mismatch' }),
      paymentRailAvailable: false,
    })).toMatchObject({
      kind: 'amount_mismatch',
      receivedAmount: 400_000,
    })
  })
})

function paymentFixture(
  overrides: Partial<NonNullable<LocalDeal['payment']>> = {},
): NonNullable<LocalDeal['payment']> {
  const paymentCode = 'NS1234567890ABCDEF12345678'
  return {
    grossAmount: 450_000,
    paymentCode,
    platformFee: 67_500,
    provider: 'sepay_vietqr',
    qrImageUrl: paymentQrUrl({ amount: 450_000, paymentCode }),
    status: 'vietqr_ready',
    transferContent: paymentCode,
    workerNet: 382_500,
    ...overrides,
  }
}

function paymentQrUrl({
  amount = 450_000,
  paymentCode = 'NS1234567890ABCDEF12345678',
}: {
  amount?: number
  paymentCode?: string
} = {}) {
  return `https://vietqr.app/img?acc=1234567890&bank=MB&amount=${amount}&des=${paymentCode}&template=compact&showinfo=true&holder=NestScout&store=NestScout`
}
