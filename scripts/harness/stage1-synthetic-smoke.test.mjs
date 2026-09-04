import assert from 'node:assert/strict'
import test from 'node:test'

import { assertSafeErrorEvidence } from '../../apps/api/scripts/lib/stage1-synthetic-smoke-core.mjs'

const traceId = '10000000-0000-4000-8000-000000000059'

test('accepts only the exact operational error with safe support lineage', () => {
  assert.deepEqual(assertSafeErrorEvidence({
    status: 426,
    code: 'CLIENT_UPDATE_REQUIRED',
    supportCode: 'A1B2C3D4',
    traceId,
  }, {
    status: 426,
    code: 'CLIENT_UPDATE_REQUIRED',
    surface: 'release_mismatch',
  }), {
    surface: 'release_mismatch',
    status: 426,
    code: 'CLIENT_UPDATE_REQUIRED',
    supportCode: 'A1B2C3D4',
    traceId,
  })
})

test('rejects a copied status without the expected code, support code, or trace', () => {
  const expected = { status: 409, code: 'INVALID_STATUS', surface: 'confirmation_contract' }
  assert.throws(() => assertSafeErrorEvidence({
    status: 409, code: 'UNKNOWN', supportCode: 'A1B2C3D4', traceId,
  }, expected), /expected safe error INVALID_STATUS/u)
  assert.throws(() => assertSafeErrorEvidence({
    status: 409, code: 'INVALID_STATUS', supportCode: null, traceId,
  }, expected), /expected safe error INVALID_STATUS/u)
  assert.throws(() => assertSafeErrorEvidence({
    status: 409, code: 'INVALID_STATUS', supportCode: 'A1B2C3D4', traceId: 'invalid',
  }, expected), /expected safe error INVALID_STATUS/u)
})
