import { describe, expect, it, vi } from 'vitest'

import {
  buildSePayVietQrPaymentInstructions,
  parseSePayVietQrWebhookPayload,
  receiveSePayVietQrWebhook,
  verifySePayWebhookSignature,
} from '../../../../../supabase/functions/mobile-api/_shared/services/sepay-vietqr-payment.service'

const encoder = new TextEncoder()

async function signSePayPayload(rawBody: string, secret: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  )
  return `sha256=${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

describe('SePay VietQR webhook verification', () => {
  it('accepts only a current HMAC signature over the untouched raw body', async () => {
    const rawBody = '{"id":92704,"code":"NS1234567890ABCDEF12345678"}'
    const secret = 'test-only-sepay-webhook-secret'
    const timestamp = 1_784_850_000
    const signature = await signSePayPayload(rawBody, secret, timestamp)

    await expect(verifySePayWebhookSignature({
      nowMs: timestamp * 1000 + 1_000,
      rawBody,
      secret,
      signature,
      timestamp: String(timestamp),
    })).resolves.toBe(true)
    await expect(verifySePayWebhookSignature({
      nowMs: timestamp * 1000 + 1_000,
      rawBody: `${rawBody} `,
      secret,
      signature,
      timestamp: String(timestamp),
    })).resolves.toBe(false)
    await expect(verifySePayWebhookSignature({
      nowMs: (timestamp + 301) * 1000,
      rawBody,
      secret,
      signature,
      timestamp: String(timestamp),
    })).resolves.toBe(false)
  })

  it('builds a deterministic VietQR payment target without accepting a configurable QR host', () => {
    expect(buildSePayVietQrPaymentInstructions({
      accountHolder: 'NESTSCOUT COMPANY',
      accountNumber: '1234567890',
      amount: 750_000,
      bankCode: 'VCB',
      paymentCode: 'NS1234567890ABCDEF12345678',
    })).toEqual({
      paymentCode: 'NS1234567890ABCDEF12345678',
      qrImageUrl: 'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=750000&des=NS1234567890ABCDEF12345678&template=compact&showinfo=true&holder=NESTSCOUT+COMPANY&store=NestScout',
      transferContent: 'NS1234567890ABCDEF12345678',
    })
  })

  it('accepts only inbound merchant transfers carrying a supported NestScout payment code', () => {
    expect(parseSePayVietQrWebhookPayload({
      accountNumber: '1234567890',
      code: 'NS1234567890ABCDEF12345678',
      id: 92704,
      transferAmount: 750_000,
      transferType: 'in',
    }, '1234567890')).toEqual({
      amount: 750_000,
      paymentCode: 'NS1234567890ABCDEF12345678',
      referenceCode: null,
      transactionId: '92704',
    })
    expect(parseSePayVietQrWebhookPayload({
      accountNumber: '1234567890',
      code: 'NS1234567890ABCDEF12345678',
      id: 92704,
      transferAmount: 750_000,
      transferType: 'out',
    }, '1234567890')).toBeNull()
    expect(parseSePayVietQrWebhookPayload({
      accountNumber: '9988776655',
      code: 'NS1234567890ABCDEF12345678',
      id: 92704,
      transferAmount: 750_000,
      transferType: 'in',
    }, '1234567890')).toBeNull()
  })

  it('rejects an unsigned provider callback before it can invoke the payment RPC', async () => {
    const rpc = vi.fn()
    await expect(receiveSePayVietQrWebhook({ rpc } as never, {
      accountHolder: 'NESTSCOUT COMPANY',
      accountNumber: '1234567890',
      bankCode: 'VCB',
      enabled: true,
      webhookSecret: 'test-only-sepay-webhook-secret',
    }, {
      rawBody: '{"id":92704,"accountNumber":"1234567890","code":"NS1234567890ABCDEF12345678","transferType":"in","transferAmount":750000}',
      signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      timestamp: '1784850000',
      nowMs: 1_784_850_001_000,
    })).rejects.toMatchObject({ code: 'INVALID_SIGNATURE', status: 401 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends only verified inbound payment facts through the atomic payment RPC', async () => {
    const rawBody = '{"id":92704,"accountNumber":"1234567890","code":"NS1234567890ABCDEF12345678","transferType":"in","transferAmount":750000,"referenceCode":"FT260727"}'
    const secret = 'test-only-sepay-webhook-secret'
    const timestamp = 1_784_850_000
    const signature = await signSePayPayload(rawBody, secret, timestamp)
    const rpc = vi.fn(async () => ({
      data: [{
        job_id: 'job-1',
        job_status: 'paid',
        ok: true,
        outcome: 'paid',
        payment_status: 'received',
      }],
      error: null,
    }))

    await expect(receiveSePayVietQrWebhook({ rpc } as never, {
      accountHolder: 'NESTSCOUT COMPANY',
      accountNumber: '1234567890',
      bankCode: 'VCB',
      enabled: true,
      webhookSecret: secret,
    }, {
      rawBody,
      signature,
      timestamp: String(timestamp),
      nowMs: timestamp * 1000 + 1_000,
    })).resolves.toEqual({ outcome: 'paid' })

    expect(rpc).toHaveBeenCalledWith('apply_sepay_vietqr_payment_webhook', {
      p_payment_code: 'NS1234567890ABCDEF12345678',
      p_reference_code: 'FT260727',
      p_transaction_id: '92704',
      p_transfer_amount: 750_000,
    })
  })

  it('fails closed when the atomic payment RPC does not acknowledge the callback', async () => {
    const rawBody = '{"id":92704,"accountNumber":"1234567890","code":"NS1234567890ABCDEF12345678","transferType":"in","transferAmount":750000}'
    const secret = 'test-only-sepay-webhook-secret'
    const timestamp = 1_784_850_000
    const signature = await signSePayPayload(rawBody, secret, timestamp)
    const rpc = vi.fn(async () => ({
      data: [{ ok: false, outcome: 'paid' }],
      error: null,
    }))

    await expect(receiveSePayVietQrWebhook({ rpc } as never, {
      accountHolder: 'NESTSCOUT COMPANY',
      accountNumber: '1234567890',
      bankCode: 'VCB',
      enabled: true,
      webhookSecret: secret,
    }, {
      rawBody,
      signature,
      timestamp: String(timestamp),
      nowMs: timestamp * 1000 + 1_000,
    })).rejects.toMatchObject({ code: 'PROCESSING_FAILED', status: 500 })
  })
})
