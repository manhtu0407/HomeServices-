// Runs the frozen scenario matrix and the handler-level hazard drivers against the current worktree state.
// usage: node reproduce.mjs <phase>   (phase is a folder name under results/, for example "pre" or "post")
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT, BASELINE, evidenceRoot, run } from './run-candidate.mjs'

const phase = process.argv[2]
if (!phase) {
  console.error('usage: node reproduce.mjs <phase>')
  process.exit(2)
}
const out = join(evidenceRoot, 'results', phase)
mkdirSync(out, { recursive: true })
const matrix = join(BASELINE, '01-freeze/scenario-matrix.json')
const diag = 'src/__tests__/kael-edge-runtime/diag'
const audit = 'src/__tests__/kael-edge-runtime/audit'

const plan = [
  { label: `${phase}-matrix`, testPath: `${diag}/kawa-diag-matrix-pillar.test.ts`, env: { KAWA_DIAG_OUT: join(out, 'matrix.json') } },
  { label: `${phase}-journey`, testPath: `${diag}/kawa-diag-journey-pillar.test.ts`, env: { KAWA_DIAG_OUT: join(out, 'journey.json') } },
  { label: `${phase}-matrix-flags-on`, testPath: `${diag}/kawa-diag-matrix-pillar.test.ts`, env: { KAWA_DIAG_OUT: join(out, 'matrix-flags-on.json'), KAWA_DIAG_PLAYBOOK_FLAGS: 'on' } },
  { label: `${phase}-journey-flags-on`, testPath: `${diag}/kawa-diag-journey-pillar.test.ts`, env: { KAWA_DIAG_OUT: join(out, 'journey-flags-on.json'), KAWA_DIAG_PLAYBOOK_FLAGS: 'on' } },
  { label: `${phase}-supp-c6b`, testPath: `${diag}/kawa-diag-matrix-pillar.test.ts`, matrix: 'supplementary-matrix.json', env: { KAWA_DIAG_OUT: join(out, 'supp-c6b.json') } },
  { label: `${phase}-supp-c6b-flags-on`, testPath: `${diag}/kawa-diag-matrix-pillar.test.ts`, matrix: 'supplementary-matrix.json', env: { KAWA_DIAG_OUT: join(out, 'supp-c6b-flags-on.json'), KAWA_DIAG_PLAYBOOK_FLAGS: 'on' } },
  { label: `${phase}-handler`, testPath: `${audit}/kawa-audit-handler-pillar.test.ts`, withAudit: true, env: { KAWA_AUDIT_MATRIX: matrix, KAWA_AUDIT_SNAPSHOT: phase, KAWA_AUDIT_OUT: join(out, 'handler.json') } },
  { label: `${phase}-triplet`, testPath: `${audit}/kawa-r1-hazard-triplet-pillar.test.ts`, withAudit: true, env: { KAWA_AUDIT_MATRIX: matrix, KAWA_AUDIT_SNAPSHOT: phase, KAWA_AUDIT_OUT: join(out, 'triplet.json') } },
  { label: `${phase}-dx03-persisted`, testPath: `${audit}/kawa-audit-dx03-persisted-pillar.test.ts`, withAudit: true, env: { KAWA_AUDIT_MATRIX: matrix, KAWA_AUDIT_SNAPSHOT: phase, KAWA_AUDIT_OUT: join(out, 'dx03-persisted.json') } },
  { label: `${phase}-dx03-language`, testPath: `${audit}/kawa-audit-dx03-language-pillar.test.ts`, withAudit: true, env: { KAWA_AUDIT_SNAPSHOT: phase, KAWA_AUDIT_OUT: join(out, 'dx03-language.json') } },
]
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null
const summary = []
for (const item of plan) {
  if (only && ![...only].some((key) => item.label.endsWith(key))) continue
  const exit = run(item)
  summary.push({ label: item.label, exit })
  console.log(JSON.stringify({ label: item.label, exit }))
}
process.exit(summary.every((entry) => entry.exit === 0) ? 0 : 1)
