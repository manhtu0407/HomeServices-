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
  const root = fixture('Yêu cầu của bạn đã được tiếp nhận')
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
