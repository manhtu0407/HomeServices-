import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { kaelChatTurnSchema } from '../../../../../../supabase/functions/_shared/contracts/kael-chat'
import { installEdgeRuntimeTestHooks } from '../harness'
import { buildWorld, numbersIn, post } from './diag-support'

installEdgeRuntimeTestHooks()

type Row = { id: string; text: string; expected: string | null; kind: 'clear' | 'judgement'; service?: string }
const rowsPath = process.env.KAWA_DIAG_H5_ROWS
const expectedSha = process.env.KAWA_DIAG_H5_ROWS_SHA
if (!rowsPath || !expectedSha) throw new Error('KAWA_DIAG_H5_ROWS and KAWA_DIAG_H5_ROWS_SHA are required')
const snapshot = process.env.KAWA_DIAG_SNAPSHOT ?? 'unknown'
const mode = process.env.KAWA_DIAG_H5_MODE ?? 'classifier+e2e'
const bytes = readFileSync(rowsPath, 'utf8').replace(/\r\n/g, '\n')
const sha = createHash('sha256').update(bytes).digest('hex')
if (sha !== expectedSha) throw new Error(`row file hash mismatch ${sha}`)
const parsed = JSON.parse(bytes) as { rows: Row[] }
const rows = parsed.rows

const ROUTE_NUMBERS: Record<string, string[]> = { fire: ['114'], gas: ['114'], medical: ['115'], police: ['113'], electrical_water: ['112', '114', '115'], uncertain: ['112'] }
const numbersToRoute = (numbers: string[]): string | null => {
  const has = (list: string[]) => list.every((number) => numbers.includes(number))
  if (has(ROUTE_NUMBERS.electrical_water)) return 'electrical_water'
  if (numbers.includes('115') && !numbers.includes('114') && !numbers.includes('113') && !numbers.includes('112')) return 'medical'
  if (numbers.includes('113') && numbers.length === 1) return 'police'
  if (numbers.includes('114') && numbers.length === 1) return 'fire_or_gas'
  if (numbers.includes('112') && numbers.length === 1) return 'uncertain'
  return numbers.length ? 'other:' + numbers.join(',') : null
}

const results: Array<Record<string, unknown>> = []

async function tracedClassifier(row: Row) {
  let traced: any = null
  try {
    traced = await import('./clone/emergency-guidance.traced')
  } catch {
    return null
  }
  traced.TRACE.length = 0
  const route = traced.resolveReportedEmergencyGuidance(row.text, 'vi', { serviceType: row.service ?? null })?.route ?? null
  const entries = traced.TRACE.map((entry: any) => ({ ...entry }))
  return { route, entries }
}

describe(`kawa-diag H5 on ${snapshot} (${mode})`, () => {
  for (const row of rows) {
    it(row.id, async () => {
      const entry: Record<string, unknown> = { id: row.id, expected: row.expected, kind: row.kind, service: row.service ?? null, text_chars: row.text.length }
      if (mode.includes('classifier')) {
        const { resolveReportedEmergencyGuidance } = await import('../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance')
        const { buildSignalText, segmentRanges } = await import('../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-signal-text')
        const route = resolveReportedEmergencyGuidance(row.text, 'vi', { serviceType: row.service ?? null })?.route ?? null
        const signal = buildSignalText(row.text)
        const traced = await tracedClassifier(row)
        Object.assign(entry, {
          classifier_route: route,
          plain: signal.plain,
          segments: segmentRanges(signal.plain).map((range) => signal.plain.slice(range.start, range.end)),
          schema_ok: kaelChatTurnSchema.safeParse({ message: row.text, language: 'vi' }).success,
          traced_route: traced?.route ?? null,
          clone_matches_original: traced ? traced.route === route : null,
          trace: traced?.entries ?? null,
        })
      }
      if (mode.includes('e2e')) {
        const inst = buildWorld(row.service && ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'].includes(row.service) ? row.service : 'plumbing', { kind: 'active_case' })
        try {
          const before = inst.world.db.tables.kael_chat_turns.length
          const providersBefore = inst.world.modelCalls.length
          const response = await post(inst.world, '/kael/chat/39800000-0000-4000-8000-000000000001', { message: row.text, language: 'vi' })
          const kael = inst.world.db.tables.kael_chat_turns.slice(before).filter((turn) => turn.role === 'kael')
          const text = kael.map((turn) => String(turn.text_content ?? '')).join('\n') + (response.status >= 200 && response.status < 300 ? '' : JSON.stringify(response.body))
          const numbers = numbersIn(text)
          entry.e2e = {
            status: response.status,
            numbers,
            delivered_route: numbersToRoute(numbers),
            emergency_route_metadata: kael.map((turn) => (turn.safe_metadata as Record<string, unknown>)?.emergency_route ?? null).filter((value) => value !== null),
            provider_calls: inst.world.modelCalls.length - providersBefore,
            reply_head: text.slice(0, 120),
          }
        } catch (error) {
          entry.e2e = { error: String((error as Error)?.message ?? error).slice(0, 300) }
        } finally {
          inst.restore()
        }
      }
      results.push(entry)
      expect(entry.id).toBe(row.id)
    })
  }
})

import { afterAll } from 'vitest'
afterAll(() => {
  const out = process.env.KAWA_DIAG_OUT
  if (!out) return
  writeFileSync(out, `${JSON.stringify({
    schema: 'nestscout.diagnostic_h5_rows.v1',
    label: 'REPRODUCTION',
    independent_validation: false,
    snapshot,
    mode,
    rows_sha256_lf: sha,
    rows: results.length,
    executed_at: new Date().toISOString(),
    results,
  }, null, 2)}\n`)
})
