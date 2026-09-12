import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  auditProductionUiCopy,
  buildProductionUiNormalityReceipt,
  verifyProductionUiNormalityReceipt,
} from './check-production-ui-copy.mjs'

function fixture(copy, source = `export const Surface = () => <Text>${copy}</Text>\n`) {
  const root = mkdtempSync(join(tmpdir(), 'stage1-ui-copy-'))
  const path = join(root, 'apps', 'mobile', 'components', 'customer')
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'surface.tsx'), source)
  return root
}

test('creates a checksummed receipt for human-facing Production copy', () => {
  const root = fixture('', "export const copy = { vi: 'Yêu cầu của bạn đã được tiếp nhận', en: 'Your request was received' }\n")
  try {
    const audit = auditProductionUiCopy(root)
    assert.deepEqual(audit.unsafe, [])
    const receipt = buildProductionUiNormalityReceipt({ audit, now: Date.UTC(2026, 7, 23) })
    assert.equal(verifyProductionUiNormalityReceipt(receipt), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects internal environment and debugging language in visible copy', () => {
  const root = fixture('Staging debug trace ID')
  try {
    const audit = auditProductionUiCopy(root)
    assert.equal(audit.unsafe.length, 1)
    assert.throws(() => buildProductionUiNormalityReceipt({ audit }), /internal release or test terminology/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects test persona and internal intake terminology in visible copy', () => {
  for (const copy of ['Stage 1 Native Worker', 'Tier A · Tier B', 'Kỹ thuật viên test']) {
    const root = fixture(copy)
    try {
      assert.equal(auditProductionUiCopy(root).unsafe.length, 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('does not confuse an internal route identifier with visible copy', () => {
  const root = fixture('', "export const internalRoute = '/jobs/staging-payment-confirm'\n")
  try {
    assert.deepEqual(auditProductionUiCopy(root).unsafe, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('does not confuse a React Native test identifier with visible copy', () => {
  const root = fixture('', "export const Surface = () => <Text testID=\"worker-stage1-test\">Sẵn sàng</Text>\n")
  try {
    assert.deepEqual(auditProductionUiCopy(root).unsafe, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects English copy in a Vietnamese localization slot', () => {
  const root = fixture('', "export const copy = { vi: 'Customer confirmed', en: 'Customer confirmed' }\n")
  try {
    const audit = auditProductionUiCopy(root)
    assert.equal(audit.languageLeakage.length, 1)
    assert.equal(audit.languageLeakage[0].language, 'vi')
    assert.throws(() => buildProductionUiNormalityReceipt({ audit }), /language leakage/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects an English sentence even without a reserved product marker', () => {
  const root = fixture('', "export const copy = { vi: 'Take a quiet breath', en: 'Take a quiet breath' }\n")
  try {
    const audit = auditProductionUiCopy(root)
    assert.equal(audit.languageLeakage.length, 1)
    assert.equal(audit.languageLeakage[0].reason, 'english-phrase-in-vietnamese-slot')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects Vietnamese copy in an English localization slot', () => {
  const root = fixture('', "export const copy = textByLanguage(language, 'Khách đã xác nhận', 'Khách đã xác nhận')\n")
  try {
    const audit = auditProductionUiCopy(root)
    assert.equal(audit.languageLeakage.length, 1)
    assert.equal(audit.languageLeakage[0].language, 'en')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts localized pairs and neutral brand or protocol terms', () => {
  const root = fixture('', [
    "export const status = language === 'vi' ? 'Khách đã xác nhận qua Kael' : 'Customer confirmed through Kael'",
    "export const auth = { vi: 'Đăng nhập bằng Apple', en: 'Sign in with Apple' }",
    "export const amount = textByLanguage(language, 'Thanh toán 120.000 VND bằng QR', 'Pay VND 120,000 by QR')",
  ].join('\n'))
  try {
    const audit = auditProductionUiCopy(root)
    assert.deepEqual(audit.languageLeakage, [])
    assert.ok(audit.localizedLiteralCount >= 6)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
