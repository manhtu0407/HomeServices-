// DX-03 audit probe: for each frozen hazard text that lost its emergency number when the playbook flags
// were on, call the same functions the gate calls (resolveCaseEmergency and its deferral predicate) and
// the flagged path's own deterministic guidance, in both languages, flags off and on.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_PLAYBOOK_FLAGS, evidenceRoot, load, numbersIn, setEnv, sha256, writeJson } from './lib.mjs'

const matrixPath = join(evidenceRoot, '01-freeze', 'scenario-matrix.json')
if (sha256(matrixPath) !== 'dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7') throw new Error('frozen matrix changed')
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))
const ACTOR = '39800000-0000-4000-8000-0000000000a1'

const turn = await load('after', 'domains/kael-chat/emergency-turn.ts')
const safety = await load('after', 'domains/kael-chat/intake-safety.ts')
const policy = await load('after', 'kael/kael-guardrails/electrical-intake-policy.ts')

const stepOf = (id, stepId) => {
  const scenario = matrix.scenarios.find((s) => s.id === id)
  const step = scenario.steps.find((s) => s.id === stepId)
  return { scenario, step, texts: [step.message, step.voice_transcript, step.text_note].filter(Boolean) }
}
const targets = [
  ['PLMB-S3', '1', 'lost with flags on'],
  ['HVAC-S3', '1', 'lost with flags on (English text)'],
  ['UPHO-S4', '4', 'lost with flags on'],
  ['C6', '1', 'text number lost with flags on; structured field present'],
  ['ELEC-S3', '1', 'control: kept with flags on'],
  ['CLEN-S3', '1', 'control: medical route, kept with flags on'],
  ['HAND-S4', '4', 'control: medical route, kept with flags on'],
  ['ELEC-S4', '4', 'DX-02 text: gained with flags on'],
]

const rows = []
for (const [id, stepId, note] of targets) {
  const { scenario, step, texts } = stepOf(id, stepId)
  const row = { scenario: id, step: stepId, service: scenario.service, language: step.language, note }
  for (const flags of ['off', 'on']) {
    setEnv(flags === 'on' ? ALL_PLAYBOOK_FLAGS : {})
    const emergency = turn.resolveCaseEmergency({ message: texts, language: step.language, serviceType: scenario.service, persistedSafetySignals: [], actorId: ACTOR })
    const signals = safety.persistentKaelSafetySignalsFromTexts(texts, scenario.service, [], ACTOR)
    const adviceVi = policy.deterministicSafetyGuidance(signals, 'vi', scenario.service)
    const adviceEn = policy.deterministicSafetyGuidance(signals, 'en', scenario.service)
    row[`flags_${flags}`] = {
      gate_result: emergency ? { route: emergency.guidance.route, stops_turn: emergency.stopsTurn } : null,
      deferral_predicate_requiresImmediateKaelSafetyPathForTexts: safety.requiresImmediateKaelSafetyPathForTexts(texts, scenario.service, [], ACTOR),
      flagged_signals: signals,
      flagged_advice_vi_numbers: adviceVi === null ? null : numbersIn(adviceVi),
      flagged_advice_en_numbers: adviceEn === null ? null : numbersIn(adviceEn),
      flagged_advice_vi_head: adviceVi === null ? null : adviceVi.slice(0, 160),
    }
  }
  rows.push(row)
}
const out = { schema: 'nestscout.audit.dx03_probes.v1', classifier_and_gate_snapshot: 'after', rows }
console.log(JSON.stringify(out, null, 1))
console.error('written', writeJson('dx03-gate-deferral-probes.json', out))
