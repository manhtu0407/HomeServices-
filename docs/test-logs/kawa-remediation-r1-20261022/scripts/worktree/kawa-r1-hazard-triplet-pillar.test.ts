// Remediation round 1 driver, derived from the audit handler driver with one addition: the route carried by the
// emergency_route metadata of the reply turns is recorded beside the visible numbers and the structured field.
// Audit driver: runs every hazard step of the frozen matrix through the real handler with its own
// observation and scoring code. World plumbing (buildWorld/post/requestBody) is reused from the committed
// harness; the scoring below is independent. Variants: playbook flags off/on, and "created" Cases
// (opened through the real create route) in place of the harness-seeded active Case.
import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { buildWorld, post, requestBody, type Step } from '../diag/diag-support'

installEdgeRuntimeTestHooks()

const matrix = JSON.parse(readFileSync(process.env.KAWA_AUDIT_MATRIX as string, 'utf8'))
const snapshot = process.env.KAWA_AUDIT_SNAPSHOT ?? 'unknown'
const NUM = /(?<!\d)(11[2-5])(?!\d)/g
const numbers = (text: string) => [...new Set([...text.matchAll(NUM)].map((m) => m[1]))].sort()
const REQUIRED: Record<string, string[]> = matrix.route_policy.required_numbers

type Observed = {
  step: string
  status: number
  kael_texts: string[]
  error_code: string | null
  error_message: string | null
  structured_emergency: unknown
  metadata_routes: string[]
  text_numbers: string[]
  provider_calls: string[]
  session_status: string | null
  trace_outcomes: string[]
  delivered_text: boolean
  delivered_structured: boolean
  route_exact_text: boolean
  body_head: string
}

function judge(step: Step, observed: Pick<Observed, 'text_numbers' | 'structured_emergency'>) {
  const set = new Set(observed.text_numbers)
  const has = (route?: string) => !!route && (REQUIRED[route] ?? []).length > 0 && (REQUIRED[route] ?? []).every((n) => set.has(n))
  const exact = has(step.route)
  const acceptable = exact || (step.also_accept_routes ?? []).some((route) => has(route)) || set.has('112')
  return { acceptable, exact }
}

async function runOne(service: string, world: ReturnType<typeof buildWorld>, step: Step): Promise<Observed> {
  const consoleFrom = world.console.length
  const turnsBefore = world.world.db.tables.kael_chat_turns.length
  const callsFrom = world.world.modelCalls.length
  const { path, payload } = requestBody(step, service)
  const response = await post(world.world, path, payload)
  const newKael = world.world.db.tables.kael_chat_turns.slice(turnsBefore).filter((turn) => turn.role === 'kael')
  const body = response.body ?? {}
  // The Edge error envelope is {code, error: "<text>", emergency?: {version, route}}.
  const err = body as Record<string, unknown>
  const kaelTexts = newKael.map((turn) => String(turn.text_content ?? ''))
  const errorMessage = typeof err.error === 'string' ? err.error : typeof err.message === 'string' ? err.message : null
  const textNumbers = numbers([...kaelTexts, errorMessage ?? ''].join('\n'))
  const session = world.world.db.tables.kael_chat_sessions[0] as Record<string, any> | undefined
  const structured = err.emergency ?? null
  const traces = world.console.slice(consoleFrom).filter((line) => line.text.includes('kael_turn_trace.v1'))
    .map((line) => new RegExp('"outcome":"([^"]*)"').exec(line.text)?.[1] ?? '?')
  const verdict = judge(step, { text_numbers: textNumbers, structured_emergency: structured })
  return {
    step: step.id,
    status: response.status,
    kael_texts: kaelTexts,
    error_code: typeof err.code === 'string' ? err.code : null,
    error_message: errorMessage,
    structured_emergency: structured,
    metadata_routes: newKael.map((turn) => (turn.safe_metadata as Record<string, unknown>)?.emergency_route).filter((route): route is string => typeof route === 'string'),
    text_numbers: textNumbers,
    provider_calls: world.world.modelCalls.slice(callsFrom).map((call) => `${call.provider}:${call.purpose}`),
    session_status: session?.status ?? null,
    trace_outcomes: traces,
    delivered_text: verdict.acceptable,
    delivered_structured: structured !== null && typeof structured === 'object',
    route_exact_text: verdict.exact,
    body_head: JSON.stringify(body).slice(0, 420),
  }
}

const hazardScenarios = (matrix.scenarios as Array<Record<string, any>>).filter((scenario) => scenario.kind !== 'journey' && scenario.steps.some((step: Step) => step.hazard))
const results: Array<Record<string, unknown>> = []

function setFlags(on: boolean) {
  if (on) process.env.KAWA_DIAG_PLAYBOOK_FLAGS = 'on'
  else delete process.env.KAWA_DIAG_PLAYBOOK_FLAGS
}

describe(`kawa r1 hazard triplet driver on ${snapshot}`, () => {
  for (const flags of ['off', 'on'] as const) {
    for (const mode of ['frozen', 'created'] as const) {
      for (const scenario of hazardScenarios) {
        if (mode === 'created' && scenario.world?.kind === 'new_case') continue
        const variants = scenario.variants ?? [{ id: 'main', world: scenario.world }]
        for (const variant of variants) {
          it(`${scenario.id}/${variant.id} flags=${flags} mode=${mode}`, async () => {
            setFlags(flags === 'on')
            const useCreated = mode === 'created' && variant.world.kind === 'active_case'
            const worldSpec = useCreated ? { kind: 'new_case' as const } : variant.world
            const inst = buildWorld(scenario.service, worldSpec)
            try {
              const observed: Observed[] = []
              if (useCreated) {
                const opener = (matrix.scenarios as Array<Record<string, any>>).find((s) => s.service === scenario.service && s.class === 'S1')
                const first: Step = { ...opener.steps[0], id: 'open' }
                observed.push(await runOne(scenario.service, inst, first))
              }
              for (const step of scenario.steps as Step[]) {
                const o = await runOne(scenario.service, inst, step)
                observed.push(o)
              }
              const hazardSteps = (scenario.steps as Step[]).filter((step) => step.hazard)
              results.push({
                scenario: scenario.id, variant: variant.id, flags, mode,
                hazard: hazardSteps.map((step) => {
                  const o = observed.find((entry) => entry.step === step.id)!
                  return { step: step.id, route: step.route, status: o.status, text_numbers: o.text_numbers, delivered_text: o.delivered_text, route_exact_text: o.route_exact_text, structured: o.structured_emergency, metadata_routes: o.metadata_routes, delivered_structured: o.delivered_structured, providers: o.provider_calls, trace: o.trace_outcomes, session_status: o.session_status, error_code: o.error_code, first_kael_text: (o.kael_texts[0] ?? o.error_message ?? '').slice(0, 220) }
                }),
                steps: observed,
              })
              expect(observed.length).toBeGreaterThan(0)
            } finally {
              inst.restore()
              delete process.env.KAWA_DIAG_PLAYBOOK_FLAGS
            }
          })
        }
      }
    }
  }
})

afterAll(() => {
  const out = process.env.KAWA_AUDIT_OUT
  if (!out) return
  writeFileSync(out, `${JSON.stringify({ schema: 'nestscout.r1.hazard_triplet.v1', snapshot, executed_at: new Date().toISOString(), results }, null, 2)}\n`)
})
