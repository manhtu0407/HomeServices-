// Audit probe: why UPHO-S4 step 4 loses its emergency number when the playbook flags are on.
// Replays the frozen UPHO-S4 steps through the real handler, then asks the gate (resolveCaseEmergency) the
// same question it asks in turn.ts, with the safety signals the session has actually persisted.
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { buildWorld, post, requestBody, type Step } from '../diag/diag-support'
import { resolveCaseEmergency } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn'
import { requiresImmediateKaelSafetyPathForTexts } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/intake-safety'

installEdgeRuntimeTestHooks()

const matrix = JSON.parse(readFileSync(process.env.KAWA_AUDIT_MATRIX as string, 'utf8'))
const snapshot = process.env.KAWA_AUDIT_SNAPSHOT ?? 'unknown'
const OWNER_ID = '39800000-0000-4000-8000-0000000000a1'
const records: Array<Record<string, unknown>> = []

describe(`dx03 persisted signals on ${snapshot}`, () => {
  for (const scenarioId of ['UPHO-S4', 'ELEC-S4', 'HVAC-S4']) {
    for (const flags of ['off', 'on'] as const) {
      it(`${scenarioId} flags=${flags}`, async () => {
        if (flags === 'on') process.env.KAWA_DIAG_PLAYBOOK_FLAGS = 'on'
        else delete process.env.KAWA_DIAG_PLAYBOOK_FLAGS
        const scenario = matrix.scenarios.find((s: any) => s.id === scenarioId)
        const inst = buildWorld(scenario.service, { kind: 'new_case' })
        try {
          const steps = scenario.steps as Step[]
          const log: Array<Record<string, unknown>> = []
          for (const [index, step] of steps.entries()) {
            const isHazard = step.hazard
            if (isHazard) {
              const session = inst.world.db.tables.kael_chat_sessions[0] as Record<string, any>
              const persisted = (session.safe_metadata?.intake_safety_signals ?? []) as string[]
              const texts = [step.message, step.voice_transcript].filter(Boolean) as string[]
              const withPersisted = resolveCaseEmergency({ message: texts, language: step.language, serviceType: scenario.service, persistedSafetySignals: persisted, actorId: OWNER_ID })
              const withoutPersisted = resolveCaseEmergency({ message: texts, language: step.language, serviceType: scenario.service, persistedSafetySignals: [], actorId: OWNER_ID })
              log.push({
                before_step: step.id,
                persisted_signals_before_hazard_step: persisted,
                gate_with_persisted: withPersisted ? { route: withPersisted.guidance.route, stops: withPersisted.stopsTurn } : null,
                gate_without_persisted: withoutPersisted ? { route: withoutPersisted.guidance.route, stops: withoutPersisted.stopsTurn } : null,
                predicate_with_persisted: requiresImmediateKaelSafetyPathForTexts(texts, scenario.service, persisted, OWNER_ID),
              })
            }
            const { path, payload } = requestBody(step, scenario.service)
            const response = await post(inst.world, path, payload)
            const kael = inst.world.db.tables.kael_chat_turns.filter((t) => t.role === 'kael').at(-1)
            log.push({ step: step.id, status: response.status, hazard: step.hazard, last_kael_text: String(kael?.text_content ?? '').slice(0, 200), last_kael_meta_keys: Object.keys((kael?.safe_metadata ?? {}) as object) })
            void index
          }
          records.push({ scenario: scenarioId, flags, log })
          expect(log.length).toBeGreaterThan(0)
        } finally {
          inst.restore()
          delete process.env.KAWA_DIAG_PLAYBOOK_FLAGS
        }
      })
    }
  }
})

import { afterAll } from 'vitest'
afterAll(() => {
  const out = process.env.KAWA_AUDIT_OUT
  if (out) writeFileSync(out, `${JSON.stringify({ schema: 'nestscout.audit.dx03_persisted.v1', snapshot, records }, null, 2)}\n`)
})
