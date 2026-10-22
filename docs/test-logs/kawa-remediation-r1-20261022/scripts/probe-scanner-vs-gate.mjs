// Why DX-02 did not reuse the electrical intake policy scanner: it has no past, hypothetical, resolved or quote filter.
// usage: node --experimental-transform-types probe-scanner-vs-gate.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const base = `${WORKTREE}/supabase/functions/mobile-api/_shared/kael/kael-guardrails`
const { scanIntakeSafetySignals } = await import(pathToFileURL(`${base}/electrical-intake-policy.ts`).href)
const { resolveReportedEmergencyGuidance } = await import(pathToFileURL(`${base}/emergency-guidance.ts`).href)

const texts = [
  'Hôm qua tủ điện có tia lửa nhưng thợ đã sửa xong.',
  'Tuần trước ổ cắm từng bị tia lửa, nhờ thợ thay ổ mới.',
  'Nếu tủ điện có tia lửa thì tôi phải làm gì?',
  'Tủ điện có tia lửa xẹt nhưng đã hết rồi.',
  'Tủ điện hãng có ghi "tia lửa" trên nhãn.',
  'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt sau cánh tủ.',
]
const rows = texts.map((text) => ({
  text,
  intake_scanner_signals: scanIntakeSafetySignals('electrical', text),
  shared_gate_route: resolveReportedEmergencyGuidance(text, 'vi', { serviceType: 'electrical' })?.route ?? null,
}))
writeFileSync(join(evidenceRoot, 'results', 'probe-scanner-vs-gate.json'), `${JSON.stringify({ worktree_head_note: 'run on the remediation candidate', rows }, null, 1)}\n`)
for (const row of rows) console.log(`${row.shared_gate_route ?? 'null'}\t${JSON.stringify(row.intake_scanner_signals)}\t${row.text}`)
