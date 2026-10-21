import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveReportedEmergencyGuidance } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

type Row = { id: string; text: string; expected: string | null; kind: string; disputed?: boolean; service?: string }
const PHRASES = join(process.cwd(), 'src/__tests__/kael-edge-runtime/fixtures/emergency-phrases')
const load = (name: string): Row[] => JSON.parse(readFileSync(join(PHRASES, name), 'utf8').replace(/\r\n/g, '\n')).rows
const route = (text: string, service?: string) => resolveReportedEmergencyGuidance(text, 'vi', { serviceType: service ?? null })?.route ?? null

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const strip = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const TONE_SWAP: Record<string, string> = { '́': '̉', '̀': '̃', '̉': '́', '̃': '̀', '̣': '́' }
const wrongTones = (text: string) => text.normalize('NFD').replace(/[̣̀́̃̉]/g, (mark) => TONE_SWAP[mark] ?? mark).normalize('NFC')
function perturb(text: string, kind: 'delete' | 'transpose' | 'double', seed: number) {
  const random = mulberry32(seed)
  const words = text.split(' ')
  const candidates = words.map((word, index) => ({ word, index })).filter(({ word }) => word.replace(/[^\p{L}]/gu, '').length >= 4)
  if (candidates.length === 0) return text
  const pick = candidates[Math.floor(random() * candidates.length)]
  const chars = [...pick.word]
  const position = 1 + Math.floor(random() * Math.max(1, chars.length - 2))
  if (kind === 'delete') chars.splice(position, 1)
  else if (kind === 'transpose' && position + 1 < chars.length) [chars[position], chars[position + 1]] = [chars[position + 1], chars[position]]
  else if (kind === 'double') chars.splice(position, 0, chars[position])
  words[pick.index] = chars.join('')
  return words.join(' ')
}

const COUNTERFACTUALS: Array<{ id: string; from: string; text: string; expect: string | null; mechanism: string }> = [
  { id: 'H5-024', from: 'H5-024', text: 'Bình gas lon nhà em bị rò ở cổ van, đang xì mạnh', expect: 'gas', mechanism: 'a digit-bearing token ("12kg") sits inside the filler span that the gas-object cue allows only letters in' },
  { id: 'H5-018', from: 'H5-018', text: 'Nước từ tầng trên chảy vào hộp điện của nhà em', expect: 'electrical_water', mechanism: 'the reduplicated adverb "ròng ròng" between the verb and the preposition breaks a pattern that expects them adjacent' },
  { id: 'H5-005', from: 'H5-005', text: 'Điều hòa phòng ngủ chập rồi lửa bốc lên, em đang ôm con chạy xuống cầu thang', expect: 'fire', mechanism: 'verb-object order: cues encode "lửa bốc" (fire erupts), not "bốc lửa"' },
  { id: 'H5-001', from: 'H5-001', text: 'Em vừa mở cửa tủ điện thì thấy lửa bùng lên', expect: 'fire', mechanism: 'an intervening colour adjective ("xanh lè") separates the noun from its verb in the cue' },
  { id: 'H5-002', from: 'H5-002', text: 'Căn bên cạnh nổ bình, cháy lớn, khói đang vào nhà em', expect: 'fire', mechanism: 'synonym: "cháy lớn" is a cue, "cháy dữ dội" is not' },
  { id: 'H5-011', from: 'H5-011', text: 'Cháu bé nhà em nuốt nhầm pin cúc áo, đang ho sặc sụa', expect: 'medical', mechanism: 'synonym: the ingestion cue is "nuốt nhầm"; "nuốt phải" carries the same meaning but is absent' },
  { id: 'H5-019', from: 'H5-019', text: 'Ổ cắm trong nhà tắm bị ngâm nước và nghe tiếng tí tách', expect: 'electrical_water', mechanism: 'synonym: "ngâm nước" is a cue, "ướt sũng" is not' },
  { id: 'H5-028', from: 'H5-028', text: 'Em hoảng quá, em không biết nên gọi ai', expect: 'uncertain', mechanism: 'synonym: the uncertainty cue is built on "gọi" (call); the row says "báo" (notify)' },
  { id: 'H5-013', from: 'H5-013', text: 'Có người lạ đang cạy cửa căn hộ em lúc nửa đêm', expect: 'police', mechanism: 'verb coverage: "cạy" (pry) is a cue; "cố mở" (trying to open) is not, and the clothing clause breaks the subject-verb span' },
  { id: 'H5-014', from: 'H5-014', text: 'Chồng cũ em đứng trước cửa, hét sẽ giết em', expect: 'police', mechanism: 'threat verb: "sẽ giết" (will kill) is a cue; "sẽ đánh" (will hit) is not, and "cầm gậy" is not a weapon cue' },
  { id: 'H5-040', from: 'H5-040', text: 'Tôi muốn lắp thiết bị báo rò gas trong bếp', expect: null, mechanism: 'word order on the NEGATIVE side: the prevention list holds "báo rò gas" but the row says "báo gas rò"' },
  { id: 'H5-019-round2-span', from: 'H5-019', text: 'Ổ cắm nhà tắm bị ngâm nước và nghe tiếng tí tách', expect: 'electrical_water', mechanism: 'round 2 after the round-1 synonym hypothesis was NOT confirmed: the cue allows at most two words between the fixture and "ngâm nước"; "trong nhà tắm" is three' },
  { id: 'H5-019-round2-control', from: 'H5-019', text: 'Ổ cắm trong nhà tắm bị ngâm nước và nghe tiếng tí tách', expect: null, mechanism: 'round 2 control: same sentence with the three-word gap kept must still miss, isolating the span limit from the synonym' },
  { id: 'H5-001-round3', from: 'H5-001', text: 'Em vừa mở cửa tủ điện thì thấy lửa bùng lên rồi khói trắng mù mịt', expect: 'fire', mechanism: 'round 3 isolation: only "xanh lè" removed' },
  { id: 'H5-013-round3-verb', from: 'H5-013', text: 'Có người lạ mặc áo mưa đang cạy cửa căn hộ em lúc nửa đêm', expect: 'police', mechanism: 'round 3 isolation: only the verb changed to "cạy"; clothing clause kept' },
  { id: 'H5-013-round3-clause', from: 'H5-013', text: 'Có người lạ đang cố mở cửa căn hộ em lúc nửa đêm', expect: null, mechanism: 'round 3 isolation: only the clothing clause removed; verb "cố mở" kept' },
  { id: 'H5-014-round3-threat', from: 'H5-014', text: 'Chồng cũ em đứng trước cửa, cầm gậy và hét sẽ giết em', expect: 'police', mechanism: 'round 3 isolation: only the threat verb changed to "giết"; weapon clause kept' },
  { id: 'H5-014-round3-weapon', from: 'H5-014', text: 'Chồng cũ em đứng trước cửa và hét sẽ đánh em', expect: null, mechanism: 'round 3 isolation: only the weapon clause removed; threat verb "đánh" kept' },
  { id: 'H5-028-round3', from: 'H5-028', text: 'Em hoảng quá, hình như có chuyện rất nguy hiểm nhưng em không biết nên gọi ai', expect: 'uncertain', mechanism: 'round 3 isolation: only "báo" changed to "gọi"' },
  { id: 'H5-015', from: 'H5-015', text: 'Someone climbed through my kitchen window right now', expect: 'police', mechanism: 'English morphology: the cue list holds the past tense "climbed", not "is trying to climb"' },
]

const results: Record<string, unknown> = {}

describe('kawa-diag H5 and development-set probes', () => {
  it('development sets: the rows the classifier was written against', () => {
    const per: Record<string, unknown> = {}
    let total = 0
    let correct = 0
    for (const file of ['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json']) {
      const rows = load(file).filter((row) => row.kind === 'clear' && !row.disputed)
      const positives = rows.filter((row) => row.expected !== null)
      const negatives = rows.filter((row) => row.expected === null)
      const ok = rows.filter((row) => route(row.text, row.service) === row.expected).length
      total += rows.length
      correct += ok
      per[file] = { clear_rows: rows.length, positives: positives.length, negatives: negatives.length, route_correct: ok }
    }
    results.development = { per_set: per, clear_rows: total, route_correct: correct }
    expect(total).toBeGreaterThan(0)
  })

  it('perturbation sensitivity on development positives the classifier currently gets right', () => {
    const base = ['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json']
      .flatMap((file) => load(file)).filter((row) => row.kind === 'clear' && !row.disputed && row.expected !== null && route(row.text, row.service) === row.expected)
    const trials: Record<string, (row: Row, index: number) => string> = {
      original: (row) => row.text,
      no_diacritics: (row) => strip(row.text),
      wrong_tone_marks: (row) => wrongTones(row.text),
      uppercase: (row) => row.text.toUpperCase(),
      one_letter_deleted: (row, index) => perturb(row.text, 'delete', 1000 + index),
      adjacent_letters_swapped: (row, index) => perturb(row.text, 'transpose', 2000 + index),
      one_letter_doubled: (row, index) => perturb(row.text, 'double', 3000 + index),
    }
    const out: Record<string, unknown> = { rows: base.length }
    for (const [name, make] of Object.entries(trials)) {
      let kept = 0
      let wrong = 0
      base.forEach((row, index) => {
        const got = route(make(row, index), row.service)
        if (got === row.expected) kept += 1
        else if (got !== null) wrong += 1
      })
      out[name] = { still_routed_correctly: kept, routed_to_a_different_route: wrong, lost: base.length - kept - wrong }
    }
    results.perturbation = out
    expect(base.length).toBeGreaterThan(0)
  })

  it('counterfactual probes on H5 texts (derived texts, not H5 rows; never tuned on, never counted in any rate)', () => {
    const sealed = JSON.parse(readFileSync(join(PHRASES, 'sealed-h5.json'), 'utf8').replace(/\r\n/g, '\n')).rows as Row[]
    results.counterfactuals = COUNTERFACTUALS.map((probe) => {
      const original = sealed.find((row) => row.id === probe.from)!
      const originalRoute = route(original.text, original.service)
      const variantRoute = route(probe.text)
      return {
        id: probe.id,
        original_route: originalRoute,
        variant_route: variantRoute,
        variant_expected: probe.expect,
        mechanism_confirmed: variantRoute === probe.expect && originalRoute !== probe.expect,
        mechanism: probe.mechanism,
      }
    })
    expect((results.counterfactuals as unknown[]).length).toBe(COUNTERFACTUALS.length)
  })
})

import { afterAll } from 'vitest'
afterAll(() => {
  const out = process.env.KAWA_DIAG_OUT
  if (out) writeFileSync(out, `${JSON.stringify({ schema: 'nestscout.diagnostic_h5_probes.v1', note: 'Development sets are the rows the classifier was fixed against; counterfactuals are edited copies of H5 texts used only to demonstrate a mechanism.', results }, null, 2)}\n`)
})
