// Incidental audit probe (outside the seven audit items): which customer Case routes still accept an admin
// actor in each snapshot. Reports statuses and whether the call wrote a row; draws no conclusion about intent.
import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { ADMIN, buildWorld, post } from '../diag/diag-support'

installEdgeRuntimeTestHooks()
const snapshot = process.env.KAWA_AUDIT_SNAPSHOT ?? 'unknown'
const SESSION = '39800000-0000-4000-8000-000000000001'
const records: Array<Record<string, unknown>> = []

const calls: Array<{ id: string; path: string; payload: Record<string, unknown> }> = [
  { id: 'turn', path: `/kael/chat/${SESSION}`, payload: { message: 'Mình muốn hỏi thêm về ổ cắm trong phòng ngủ.', language: 'vi' } },
  { id: 'intake-confirmation', path: `/kael/chat/${SESSION}/intake-confirmation`, payload: { decision: 'confirm', language: 'vi' } },
  { id: 'evidence', path: `/kael/chat/${SESSION}/evidence`, payload: { skip_reason: 'Không có ảnh', language: 'vi' } },
  { id: 'confirm', path: `/kael/chat/${SESSION}/confirm`, payload: { confirmation_kind: 'offer', idempotency_key: 'audit-admin-confirm-0001' } },
  { id: 'recover-confirmation', path: `/kael/chat/${SESSION}/recover-confirmation`, payload: {} },
]

describe(`admin surface on ${snapshot}`, () => {
  for (const call of calls) {
    it(call.id, async () => {
      const inst = buildWorld('electrical', { kind: 'active_case' })
      try {
        const rowsBefore = inst.world.db.tables.kael_chat_turns.length
        const response = await post(inst.world, call.path, call.payload, ADMIN)
        const body = response.body as Record<string, unknown>
        records.push({
          call: call.id, status: response.status,
          code: typeof body?.code === 'string' ? body.code : null,
          turn_rows_written: inst.world.db.tables.kael_chat_turns.length - rowsBefore,
          rpc_calls: inst.rpcCalls.filter((name) => !/^(?:begin|finish|record|append)_harness_/.test(name)),
          detail: JSON.stringify(body).slice(0, 160),
        })
        expect(response.status).toBeGreaterThan(0)
      } finally {
        inst.restore()
      }
    })
  }
})

afterAll(() => {
  const out = process.env.KAWA_AUDIT_OUT
  if (out) writeFileSync(out, `${JSON.stringify({ schema: 'nestscout.audit.admin_surface.v1', snapshot, records }, null, 2)}\n`)
})
void readFileSync
