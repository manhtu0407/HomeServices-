// DX-02 raw cue-match trace: same matchAll wrapper as h5-verify.mjs, applied to the frozen ELEC-S4 step-4
// transcript and to the single-change variants from dx02-classifier-probes.mjs.
import { load, setEnv, writeJson } from './lib.mjs'

setEnv({})
const { resolveReportedEmergencyGuidance } = await load('after', 'kael/kael-guardrails/emergency-guidance.ts')
const originalMatchAll = String.prototype.matchAll
let recorder = null
String.prototype.matchAll = function patched(pattern) {
  const iterator = originalMatchAll.call(this, pattern)
  if (!recorder || !(pattern instanceof RegExp) || pattern.flags !== 'gu') return iterator
  if (pattern.source.startsWith('\\b(?:canh (?:co )?(?:chay|hoa hoan)')) return iterator
  const all = [...iterator]
  if (all.length > 0) recorder.push({ cue: pattern.source.slice(0, 80), text: all[0][0] })
  return all[Symbol.iterator]()
}
const texts = {
  frozen: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt sau cánh tủ.',
  E1_from_tu_dien: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt từ tủ điện.',
  E3_lua_only: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy lửa sau cánh tủ.',
}
const out = {}
for (const [id, text] of Object.entries(texts)) {
  recorder = []
  const route = resolveReportedEmergencyGuidance(text, 'vi', { serviceType: 'electrical' })?.route ?? null
  out[id] = { route, raw_cue_matches: recorder }
  recorder = null
}
String.prototype.matchAll = originalMatchAll
console.log(JSON.stringify(out, null, 1))
writeJson('dx02-trace.json', out)
