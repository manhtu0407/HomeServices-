// Audit probe: the 63 sealed H5 rows through the real Case-turn handler (one fresh Case per row),
// reading only the delivered numbers. Compared in the audit script with the classifier route.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { buildWorld, post } from '../diag/diag-support'

installEdgeRuntimeTestHooks()

const snapshot = process.env.KAWA_AUDIT_SNAPSHOT ?? 'unknown'
const sealedPath = process.env.KAWA_AUDIT_H5 ?? join(process.cwd(), 'src/__tests__/kael-edge-runtime/fixtures/emergency-phrases/sealed-h5.json')
const sealedText = readFileSync(sealedPath, 'utf8').replace(/\r\n/g, '\n')
const sealedSha = createHash('sha256').update(sealedText).digest('hex')
const rows = JSON.parse(sealedText).rows as Array<{ id: string; text: string; expected: string; kind: string; service?: string }>
const NUM = /(?<!\d)(11[2-5])(?!\d)/g
const records: Array<Record<string, unknown>> = []

describe(`audit H5 end-to-end on ${snapshot}`, () => {
  it('has the sealed hash', () => {
    expect(sealedSha).toBe('80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d')
  })
  for (const row of rows) {
    it(row.id, async () => {
      const service = row.service ?? 'plumbing'
      const inst = buildWorld(service, { kind: 'active_case' })
      try {
        const before = inst.world.db.tables.kael_chat_turns.length
        const response = await post(inst.world, `/kael/chat/39800000-0000-4000-8000-000000000001`, { message: row.text, language: 'vi' })
        const kael = inst.world.db.tables.kael_chat_turns.slice(before).filter((turn) => turn.role === 'kael')
        const text = kael.map((turn) => String(turn.text_content ?? '')).join('\n')
        records.push({
          id: row.id, kind: row.kind, expected: row.expected, service, status: response.status,
          numbers: [...new Set([...text.matchAll(NUM)].map((match) => match[1]))].sort(),
          emergency_route: kael.map((turn) => (turn.safe_metadata as Record<string, unknown> | undefined)?.emergency_route ?? null).find((value) => value !== null) ?? null,
          provider_calls: inst.world.modelCalls.length,
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
  if (out) writeFileSync(out, `${JSON.stringify({ schema: 'nestscout.audit.h5_e2e.v1', snapshot, sealed_sha256_lf: sealedSha, records }, null, 2)}\n`)
})
