import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { HARNESS_VERSION, buildWorld, evaluateAssertions, loadMatrix, runStep, summariseMetrics, type Scenario } from './diag-support'

installEdgeRuntimeTestHooks()

const { matrix, sha256 } = loadMatrix()
const snapshot = process.env.KAWA_DIAG_SNAPSHOT ?? 'unknown'
const runs: Array<Record<string, unknown>> = []
const only = process.env.KAWA_DIAG_ONLY ? new Set(process.env.KAWA_DIAG_ONLY.split(',')) : null
const repeats = Number(process.env.KAWA_DIAG_REPEATS ?? '2')
const scenarios = matrix.scenarios.filter((scenario) => scenario.kind !== 'journey' && (!only || only.has(scenario.id)))

async function execute(scenario: Scenario, run: number) {
  const variants = scenario.variants ?? [{ id: 'main', world: scenario.world! }]
  const variantResults: Array<Record<string, unknown>> = []
  for (const variant of variants) {
    const inst = buildWorld(scenario.service, variant.world)
    try {
      const turnsBefore = inst.world.db.tables.kael_chat_turns.length
      const statusBefore = (inst.world.db.tables.kael_chat_sessions[0] as Record<string, unknown> | undefined)?.status as string | undefined
      const observations = []
      for (const step of scenario.steps!) observations.push(await runStep(inst, step, scenario.service, matrix))
      const all = evaluateAssertions(scenario, scenario.service, scenario.steps!, observations, inst, matrix, {
        turnsBeforeClosed: turnsBefore,
        statusBeforeClosed: statusBefore,
      })
      const gating = Object.fromEntries(scenario.gating.map((id) => [id, all[id] ?? { pass: false, detail: 'assertion not implemented' }]))
      variantResults.push({
        variant: variant.id,
        pass: Object.values(gating).every((entry) => entry.pass),
        assertions: gating,
        non_gating_assertions: Object.fromEntries(Object.entries(all).filter(([id]) => !scenario.gating.includes(id))),
        steps: observations,
        metrics: summariseMetrics(scenario.steps!, observations, matrix, inst),
        console_sample: inst.console.slice(0, 12).map((line) => `${line.level}:${line.text.slice(0, 200)}`),
      })
    } catch (error) {
      variantResults.push({ variant: variant.id, pass: false, blocked: true, error: String((error as Error)?.stack ?? error).slice(0, 1500) })
    } finally {
      inst.restore()
    }
  }
  return {
    scenario: scenario.id,
    service: scenario.service,
    class: scenario.class,
    run,
    verdict: variantResults.some((variant) => variant.blocked) ? 'BLOCKED' : variantResults.every((variant) => variant.pass) ? 'PASS' : 'FAIL',
    variants: variantResults,
  }
}

describe(`kawa-diag matrix on ${snapshot}`, () => {
  for (const scenario of scenarios) {
    for (let run = 1; run <= repeats; run += 1) {
      it(`${scenario.id} run ${run}`, async () => {
        const result = await execute(scenario, run)
        runs.push(result)
        expect(result.scenario).toBe(scenario.id)
      })
    }
  }
})

afterAll(() => {
  const out = process.env.KAWA_DIAG_OUT
  if (!out) return
  writeFileSync(out, `${JSON.stringify({
    schema: 'nestscout.diagnostic_results.v1',
    harness_version: HARNESS_VERSION,
    snapshot,
    matrix_sha256: sha256,
    executed_at: new Date().toISOString(),
    runs,
  }, null, 2)}\n`)
})
