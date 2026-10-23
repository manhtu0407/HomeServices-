import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveReportedEmergencyGuidanceFromTexts } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'
import { installEdgeRuntimeTestHooks } from '../harness'
import { activeWorld, type Service } from '../harness/emergency-fixtures'

installEdgeRuntimeTestHooks()
afterEach(() => vi.unstubAllGlobals())

const OUT = process.env.H5_EVAL_OUT
const FRESH = process.env.H5_FRESH_PROBES
const FRESH_SHA = process.env.H5_FRESH_SHA
if (!OUT || !FRESH || !FRESH_SHA) throw new Error('H5_EVAL_OUT, H5_FRESH_PROBES and H5_FRESH_SHA are required')

const FIXTURES = new URL('../fixtures/emergency-phrases/', import.meta.url)
const SERVICES: readonly Service[] = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']
const FLAGS_ON = Object.fromEntries(SERVICES.map((service) => [`KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`, 'true']))
const NUMBER = /(?<!\d)(11[2-5])(?!\d)/g

type Row = { id: string; set: 'development' | 'fresh'; klass: string; lang: 'vi' | 'en'; expected: readonly string[]; text: string; service?: Service; pinned?: boolean }

function loadRows(): Row[] {
  const rows: Row[] = []
  for (const name of ['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json']) {
    const json = JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as { rows: Array<{ id: string; text: string; expected: string | null; kind: string; service?: Service; currently?: unknown; disputed?: boolean }> }
    for (const row of json.rows) rows.push({ id: row.id, set: 'development', klass: row.kind, lang: 'vi', expected: [row.expected ?? 'none'], text: row.text, service: row.service, pinned: row.currently !== undefined || row.disputed === true })
  }
  const raw = readFileSync(FRESH as string, 'utf8')
  const sha = createHash('sha256').update(raw).digest('hex')
  if (sha !== FRESH_SHA) throw new Error(`fresh probe hash mismatch: ${sha}`)
  const json = JSON.parse(raw) as { rows: Array<{ id: string; class: string; lang: 'vi' | 'en'; expected: string[]; text: string }> }
  for (const row of json.rows) rows.push({ id: row.id, set: 'fresh', klass: row.class, lang: row.lang, expected: row.expected, text: row.text })
  return rows
}

const numbersOf = (text: string) => [...new Set([...text.matchAll(NUMBER)].map((match) => match[1] as string))].sort()

function classify(row: Row, service: Service, flags: 'off' | 'on') {
  const env: Record<string, string> = flags === 'on' ? FLAGS_ON : {}
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } })
  const started = performance.now()
  const guidance = resolveReportedEmergencyGuidanceFromTexts([row.text], row.lang, { serviceType: service })
  return { route: guidance?.route ?? 'none', ms: performance.now() - started }
}

async function handle(row: Row, service: Service, flags: 'off' | 'on') {
  const world = activeWorld(service, { env: flags === 'on' ? FLAGS_ON : {} })
  const before = world.db.tables.kael_chat_turns.length
  const started = performance.now()
  const result = await world.request('', { message: row.text, language: row.lang })
  const ms = performance.now() - started
  const fresh = world.db.tables.kael_chat_turns.slice(before).filter((turn) => turn.role === 'kael')
  const errorText = typeof result.body.error === 'string' ? result.body.error : ''
  const visible = [...fresh.map((turn) => String(turn.text_content ?? '')), errorText].join('\n')
  const routes = fresh
    .map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route)
    .filter((route): route is string => typeof route === 'string')
  const structured = (result.body.emergency as { route?: string } | undefined)?.route ?? null
  return { status: result.status, routes, structured, numbers: numbersOf(visible), ms }
}

describe('H5 standard T0 evaluation harness (temporary, never committed as a collected test)', () => {
  it('records the classifier and the real handler for every row, flags off and on', async () => {
    const rows = loadRows()
    const records: unknown[] = []
    rows.forEach((row) => void row)
    for (const [index, row] of rows.entries()) {
      const service = row.service ?? (SERVICES[index % SERVICES.length] as Service)
      const record: Record<string, unknown> = { ...row, service, serviceFromFixture: row.service !== undefined }
      for (const flags of ['off', 'on'] as const) {
        record[`classifier_${flags}`] = classify(row, service, flags)
        record[`handler_${flags}`] = await handle(row, service, flags)
      }
      records.push(record)
    }
    const timing: Array<{ shape: string; length: number; ms: number; route: string }> = []
    const unit = 'Khói đen bốc ra từ ổ cắm, không có cháy, ngày hôm qua đã sửa xong, tia lửa điện chập chờn. '
    for (const [shape, text] of [
      ['repeated mixed hazard and negation sentences', unit.repeat(400)],
      ['one long unbroken run of letters', 'a'.repeat(60000)],
      ['one long run of cue words without separators', 'khoi'.repeat(15000)],
      ['many short clauses', 'không khói, '.repeat(6000)],
      ['accent-heavy', 'Ổ cắm bốc khói đen, có mùi khét. '.repeat(1500)],
    ] as const) {
      for (const cap of [5000, text.length]) {
        const slice = text.slice(0, cap)
        const started = performance.now()
        const guidance = resolveReportedEmergencyGuidanceFromTexts([slice], 'vi', { serviceType: 'electrical' })
        timing.push({ shape: cap === 5000 ? shape + ' (capped at the 5000-character field limit)' : shape, length: slice.length, ms: performance.now() - started, route: guidance?.route ?? 'none' })
      }
    }
    mkdirSync(dirname(OUT as string), { recursive: true })
    writeFileSync(OUT as string, `${JSON.stringify({ schema: 'nestscout.h5.standard_eval_raw.v1', rows: records, timing }, null, 1)}\n`)
    expect(records.length).toBe(rows.length)
  }, 600000)
})
