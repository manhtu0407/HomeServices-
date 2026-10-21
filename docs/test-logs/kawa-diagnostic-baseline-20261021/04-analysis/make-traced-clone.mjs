import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const evidenceRoot = resolve(here, '..')
const worktree = process.argv[2] ?? 'C:/ns-diag/after'
const sourcePath = join(worktree, 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts')
const source = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
const sourceSha = createHash('sha256').update(source).digest('hex')

const importAnchor = 'from "./emergency-signal-text.ts";'
if (!source.includes(importAnchor)) throw new Error('import anchor not found')
let clone = source.replace(importAnchor, 'from "../../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-signal-text";')

const start = clone.indexOf('function hasAffirmedCue(')
if (start < 0) throw new Error('hasAffirmedCue not found')
const original = clone.slice(start)
if (!original.includes('NEGATED_CUE_SUFFIX.test(negationText(prefix')) throw new Error('unexpected hasAffirmedCue body')

const traced = `
export type TraceVerdict = 'affirmed' | 'tone' | 'hypothetical' | 'past' | 'resolved' | 'quote' | 'unless' | 'bleeding_target' | 'accept' | 'negated';
export type TraceEntry = { cue: string; match: string; index: number; verdict: TraceVerdict };
export const TRACE: TraceEntry[] = [];
export const CUE_LABELS = new Map<Cue, string>();

function hasAffirmedCue(
  signal: SignalText,
  segments: readonly Segment[],
  sentences: readonly Segment[],
  candidate: Cue,
  accept?: (index: number, end: number) => boolean,
): boolean {
  for (const match of signal.plain.matchAll(new RegExp(candidate.pattern.source, "gu"))) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const record = (verdict: TraceVerdict) => TRACE.push({ cue: CUE_LABELS.get(candidate) ?? "unlabelled", match: match[0], index, verdict });
    if (!tonesAgree(match[0], signal.accented.slice(index, end), candidate.tone ?? "tolerant", candidate.toneRules)) { record("tone"); continue; }
    const segment = segmentAt(segments, index);
    const segmentText = signal.plain.slice(segment.start, segment.end);
    const prefix = signal.plain.slice(segment.start, index);
    if (HYPOTHETICAL_BEFORE.test(prefix.slice(prefix.lastIndexOf(",") + 1))) { record("hypothetical"); continue; }
    if (PAST_MARKER.test(segmentText) && !PRESENT_MARKER.test(segmentText)) { record("past"); continue; }
    if (RESOLVED_AFTER.test(signal.plain.slice(end, segmentAt(sentences, index).end))) { record("resolved"); continue; }
    if (insideNamedQuote(signal.plain, index)) { record("quote"); continue; }
    if (candidate.unless?.test(segmentText)) { record("unless"); continue; }
    if (candidate.technicalBleeding && isBleedingATarget(signal.plain, index, end)) { record("bleeding_target"); continue; }
    if (accept && !accept(index, end)) { record("accept"); continue; }
    if (!NEGATED_CUE_SUFFIX.test(negationText(prefix, signal.accented.slice(segment.start, index)))) { record("affirmed"); return true; }
    if (SELF_NEGATION.test(prefix) && THIRD_PARTY_REST.test(signal.plain.slice(end, segmentAt(sentences, index).end))) { record("affirmed"); return true; }
    record("negated");
  }
  return false;
}

(Object.keys(EMERGENCY_CUES) as CueRoute[]).forEach((route) => EMERGENCY_CUES[route].forEach((c, i) => CUE_LABELS.set(c, route + "#" + i)));
GAS_OBJECT_CUES.forEach((c, i) => CUE_LABELS.set(c, "gas_object#" + i));
GAS_SMELL_CUES.forEach((c, i) => CUE_LABELS.set(c, "gas_smell#" + i));
GAS_BARE_VI.forEach((c, i) => CUE_LABELS.set(c, "gas_bare_vi#" + i));
GAS_BARE_EN.forEach((c, i) => CUE_LABELS.set(c, "gas_bare_en#" + i));
UNCERTAIN_SPECIFIC_CUES.forEach((c, i) => CUE_LABELS.set(c, "uncertain_specific#" + i));
UNCERTAIN_GENERIC_CUES.forEach((c, i) => CUE_LABELS.set(c, "uncertain_generic#" + i));
`
clone = clone.slice(0, start) + traced
const outDir = join(worktree, 'apps/api/src/__tests__/kael-edge-runtime/diag/clone')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'emergency-guidance.traced.ts'), clone)
const record = {
  source: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  source_sha256_lf_normalised: sourceSha,
  clone_sha256: createHash('sha256').update(clone).digest('hex'),
  transformation: 'only the import path of emergency-signal-text and the hasAffirmedCue function body (same control flow; one record() call per rejection reason; same return values) plus the label registration appended at the end of the module',
  worktree,
}
writeFileSync(join(evidenceRoot, '04-analysis/traced-clone.json'), `${JSON.stringify(record, null, 2)}\n`)
console.log(JSON.stringify(record, null, 2))
