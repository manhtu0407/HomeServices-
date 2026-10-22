// DX-01 audit probe: calls evaluateMessageBoundary exactly the way domains/kael-chat/guard.ts does,
// for every typed text and voice transcript in the frozen matrix (flags off and on), then for derived
// minimal pairs and controls. Derived texts are audit probes, not matrix scenarios.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_PLAYBOOK_FLAGS, evidenceRoot, load, setEnv, sha256, writeJson } from './lib.mjs'

const matrixPath = join(evidenceRoot, '01-freeze', 'scenario-matrix.json')
const FROZEN_SHA = 'dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7'
if (sha256(matrixPath) !== FROZEN_SHA) throw new Error('frozen matrix hash mismatch')
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))

const ACTOR = '39800000-0000-4000-8000-000000000001'
const snapshots = {}
for (const snapshot of ['before', 'after']) {
  snapshots[snapshot] = {
    boundary: await load(snapshot, 'kael/kael-guardrails/boundary-guard.ts'),
    registry: await load(snapshot, 'kael/learning/playbooks/registry.ts'),
  }
}

function decide(snapshot, flags, service, text, language = 'vi') {
  setEnv(flags === 'on' ? ALL_PLAYBOOK_FLAGS : {})
  const { boundary, registry } = snapshots[snapshot]
  const electricalPlaybookEnabled = Boolean(registry.getEnabledKaelPlaybook(service, ACTOR))
  const decision = boundary.evaluateMessageBoundary(text, service, {
    actorId: ACTOR,
    semanticInjectionClassifierEnabled: true,
    language,
    electricalPlaybookEnabled,
  })
  return decision.ok ? { declined: false } : { declined: true, reason: decision.reason, signals: decision.detectedSignals }
}

// 1. every frozen text, exactly as the handler would present it to the guard (typed message only)
const frozen = []
for (const scenario of matrix.scenarios) {
  if (scenario.kind === 'journey') continue
  for (const step of scenario.steps) {
    for (const [channel, text] of [['typed_message', step.message], ['voice_or_note_if_it_were_typed', step.voice_transcript], ['text_note_if_it_were_typed', step.text_note]]) {
      if (!text) continue
      frozen.push({
        scenario: scenario.id, step: step.id, service: scenario.service, hazard: step.hazard, channel,
        text,
        flags_off: decide('after', 'off', scenario.service, text, step.language),
        flags_on: decide('after', 'on', scenario.service, text, step.language),
        before_flags_off: decide('before', 'off', scenario.service, text, step.language),
      })
    }
  }
}

// 2. derived probes
const probes = [
  { id: 'D1-frozen-ELEC-S2', service: 'electrical', text: matrix.scenarios.find((s) => s.id === 'ELEC-S2').steps[0].message, note: 'frozen input' },
  { id: 'D1-ELEC-S2-without-appliance', service: 'electrical', text: 'Điện nhà mình lúc có lúc không, không biết do tủ điện hay không, thợ trước nói một đằng giờ mình cũng rối.', note: 'only "do máy giặt" removed' },
  { id: 'D1-ELEC-S2-fridge', service: 'electrical', text: 'Điện nhà mình lúc có lúc không, không biết do tủ điện hay do tủ lạnh, thợ trước nói một đằng giờ mình cũng rối.', note: 'only the appliance noun swapped (tủ lạnh)' },
  { id: 'D2-frozen-PLMB-S2', service: 'plumbing', text: matrix.scenarios.find((s) => s.id === 'PLMB-S2').steps[0].message, note: 'frozen input' },
  { id: 'D2-PLMB-S2-pump-water', service: 'plumbing', text: 'Nước ở nhà mình chảy yếu, có lúc do ống, có lúc do máy bơm nước của tòa nhà, mình cũng không chắc nữa.', note: 'only "máy bơm" -> "máy bơm nước" (the in-scope escape)' },
  { id: 'D2-PLMB-S2-without-pump', service: 'plumbing', text: 'Nước ở nhà mình chảy yếu, có lúc do ống, có lúc do tòa nhà, mình cũng không chắc nữa.', note: 'only "máy bơm của" removed' },
  { id: 'D3-frozen-PLMB-S4-step3', service: 'plumbing', text: matrix.scenarios.find((s) => s.id === 'PLMB-S4').steps[2].message, note: 'frozen input (typed)' },
  { id: 'D3-PLMB-S4-step3-water-heater-leak', service: 'plumbing', text: 'Bình nóng lạnh nhà mình bị rò nước ở chân bình, nhờ thợ nước qua xem.', note: 'plumbing request whose object IS a water heater' },
  { id: 'C1-control-true-oos-washer', service: 'plumbing', text: 'Mình muốn nhờ thợ sửa máy giặt bị kẹt cửa.', note: 'control: appliance is the object of the work' },
  { id: 'C2-control-true-oos-fridge', service: 'handyman', text: 'Tủ lạnh nhà mình không lạnh, nhờ thợ sửa.', note: 'control' },
  { id: 'C3-control-true-oos-wifi', service: 'handyman', text: 'Wifi nhà mình chập chờn, nhờ thợ xem.', note: 'control' },
  { id: 'F1-cleaning-fridge-oven', service: 'cleaning', text: 'Mình cần dọn dẹp tổng quát căn hộ, lau luôn tủ lạnh và bếp từ bên trong.', note: 'in-scope cleaning request that lists appliances to wipe' },
  { id: 'F2-cleaning-washer-area', service: 'cleaning', text: 'Nhờ dọn nhà và vệ sinh khu vực để máy giặt, có vết nấm mốc ở góc tường.', note: 'cleaning request near an appliance' },
  { id: 'F3-upholstery-near-tv', service: 'upholstery', text: 'Giặt giúp mình bộ sofa đặt cạnh tivi, có vết cà phê cũ.', note: 'upholstery with a TV as a location word (no fault word)' },
  { id: 'F4-handyman-shelf-near-wifi-router', service: 'handyman', text: 'Nhờ thợ lắp kệ gỗ để cái modem wifi lên tường phòng khách.', note: 'handyman shelf for a wifi modem' },
  { id: 'F5-hvac-with-washer', service: 'hvac', text: 'Máy lạnh phòng ngủ chạy ồn, phòng này cũng có máy giặt để gần đó.', note: 'in-scope hvac, appliance only as a neighbour' },
  { id: 'F6-electrical-excluded-scope', service: 'electrical', text: 'Nhờ thợ điện kiểm tra ổ cắm trong bếp, không bao gồm máy giặt.', note: 'explicit exclusion marker, electrical' },
  { id: 'F7-plumbing-excluded-scope', service: 'plumbing', text: 'Nhờ thợ nước kiểm tra vòi bồn rửa, không bao gồm máy giặt.', note: 'explicit exclusion marker, plumbing (exclusion exemption applies for non-electrical)' },
]
const derived = probes.map((probe) => ({
  ...probe,
  before_flags_off: decide('before', 'off', probe.service, probe.text),
  after_flags_off: decide('after', 'off', probe.service, probe.text),
  after_flags_on: decide('after', 'on', probe.service, probe.text),
}))

const out = {
  schema: 'nestscout.audit.dx01_probes.v1',
  matrix_sha256: FROZEN_SHA,
  note: 'flags_on = all six KAEL_PLAYBOOK_<SERVICE>_ENABLED set to true; decision made exactly as guard.ts builds the options',
  frozen_texts_declined_by_boundary: frozen.filter((row) => row.flags_off.declined || row.flags_on.declined || row.before_flags_off.declined)
    .map((row) => ({ scenario: row.scenario, step: row.step, channel: row.channel, hazard: row.hazard, flags_off: row.flags_off, flags_on: row.flags_on, before_flags_off: row.before_flags_off, text: row.text })),
  frozen_texts_checked: frozen.length,
  derived,
}
console.log(JSON.stringify(out, null, 1))
console.error('written', writeJson('dx01-boundary-probes.json', out))
