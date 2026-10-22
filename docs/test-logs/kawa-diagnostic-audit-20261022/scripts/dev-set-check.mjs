// Re-derives the development-set score and two deterministic perturbations with the audit's own code.
// Development rows are the rows the classifier was written against; this is not a performance claim.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURE_DIR, load, setEnv, writeJson } from './lib.mjs'

setEnv({})
const { resolveReportedEmergencyGuidance } = await load('after', 'kael/kael-guardrails/emergency-guidance.ts')
const route = (text, service) => resolveReportedEmergencyGuidance(text, 'vi', { serviceType: service ?? null })?.route ?? null
const rows = ['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json']
  .flatMap((file) => JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8').replace(/\r\n/g, '\n')).rows.map((row) => ({ ...row, file })))

const clear = rows.filter((row) => row.kind === 'clear' && !row.disputed)
const correct = clear.filter((row) => route(row.text, row.service) === row.expected)
const positives = clear.filter((row) => row.expected !== null)
const positivesCorrect = positives.filter((row) => route(row.text, row.service) === row.expected)

const strip = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const SWAP = { '́': '̉', '̀': '̃', '̉': '́', '̃': '̀', '̣': '́' }
const wrongTones = (text) => text.normalize('NFD').replace(/[̣̀́̃̉]/g, (mark) => SWAP[mark] ?? mark).normalize('NFC')
const trial = (make) => {
  let kept = 0, different = 0
  for (const row of positivesCorrect) {
    const got = route(make(row.text), row.service)
    if (got === row.expected) kept += 1
    else if (got !== null) different += 1
  }
  return { rows: positivesCorrect.length, kept, different_route: different, lost: positivesCorrect.length - kept - different }
}
const out = {
  schema: 'nestscout.audit.dev_set_check.v1',
  development_clear_rows: clear.length,
  development_clear_rows_routed_as_labelled: correct.length,
  development_clear_positives: positives.length,
  development_positives_routed_as_labelled: positivesCorrect.length,
  judgement_rows_excluded: rows.filter((row) => row.kind !== 'clear').length,
  disputed_rows_excluded: rows.filter((row) => row.disputed).length,
  perturbations: { original: trial((t) => t), uppercase: trial((t) => t.toUpperCase()), no_diacritics: trial(strip), wrong_tone_marks: trial(wrongTones) },
  note: 'wrong_tone_marks uses the same fixed mark rotation as the committed probe so the numbers are comparable; the three seeded single-letter perturbations were not re-derived',
}
console.log(JSON.stringify(out, null, 1))
writeJson('dev-set-check.json', out)
