// DX-02 audit probe: calls the shipped classifier and the flagged electrical scanner directly,
// without the committed diagnostic harness. Derived texts are single-change edits of the frozen
// ELEC-S4 step-4 transcript; they locate the mechanism and are not used to change anything.
import { load, numbersIn, setEnv, writeJson, SNAPSHOT_SHAS } from './lib.mjs'

setEnv({})
const guidance = await load('after', 'kael/kael-guardrails/emergency-guidance.ts')
const policy = await load('after', 'kael/kael-guardrails/electrical-intake-policy.ts')

const FROZEN_MESSAGE = 'Mình gửi thêm giọng nói.'
const FROZEN_TRANSCRIPT = 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt sau cánh tủ.'

const probes = [
  { id: 'P0-frozen-transcript', text: FROZEN_TRANSCRIPT, note: 'exact frozen input' },
  { id: 'P0-frozen-message-only', text: FROZEN_MESSAGE, note: 'typed part of the same step' },
  { id: 'P1-clause-hot-panel', text: 'Tủ điện bây giờ nóng rát tay.', note: 'first clause alone' },
  { id: 'P1-clause-burning-smell', text: 'Có mùi khét.', note: 'second clause alone' },
  { id: 'P1-clause-sparks', text: 'Thấy tia lửa xẹt sau cánh tủ.', note: 'third clause alone' },
  { id: 'E1-prep-and-fixture', text: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt từ tủ điện.', note: 'only "sau cánh tủ" -> "từ tủ điện"' },
  { id: 'E2-spark-noun', text: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa điện xẹt sau cánh tủ.', note: 'only "điện" inserted after "tia lửa"' },
  { id: 'E3-fire-word', text: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy lửa sau cánh tủ.', note: 'only "tia ... xẹt" removed' },
  { id: 'E4-smoke-added', text: 'Tủ điện bây giờ nóng rát tay, có mùi khét, bốc khói và thấy tia lửa xẹt sau cánh tủ.', note: 'only a smoke phrase added' },
  { id: 'E5-sparks-from-cabinet', text: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt ra từ tủ điện.', note: 'sparks "ra từ tủ điện"' },
  { id: 'E6-english', text: 'The electrical panel is hot to touch, smells burnt and I can see sparks behind the door.', note: 'English equivalent (not an edit of the frozen text)' },
]

const flagged = (text) => {
  const signals = policy.scanIntakeSafetySignals('electrical', text)
  const advice = policy.deterministicSafetyGuidance(signals, 'vi', 'electrical')
  return { signals, adviceNumbers: advice ? numbersIn(advice) : null, hasAdvice: advice !== null }
}

const rows = probes.map((probe) => {
  const gate = guidance.resolveReportedEmergencyGuidance(probe.text, probe.text.startsWith('The ') ? 'en' : 'vi', { serviceType: 'electrical' })
  return {
    ...probe,
    gate_route: gate ? gate.route : null,
    gate_numbers: gate ? numbersIn(gate.response) : [],
    flagged_electrical_scanner: flagged(probe.text),
  }
})

const combined = guidance.resolveReportedEmergencyGuidanceFromTexts([FROZEN_MESSAGE, FROZEN_TRANSCRIPT], 'vi', { serviceType: 'electrical' })
const out = {
  schema: 'nestscout.audit.dx02_probes.v1',
  classifier_snapshot: SNAPSHOT_SHAS.after,
  texts_as_the_handler_passes_them: [FROZEN_MESSAGE, FROZEN_TRANSCRIPT],
  handler_style_combined_route: combined ? combined.route : null,
  rows,
}
console.log(JSON.stringify(out, null, 1))
console.error('written', writeJson('dx02-classifier-probes.json', out))
