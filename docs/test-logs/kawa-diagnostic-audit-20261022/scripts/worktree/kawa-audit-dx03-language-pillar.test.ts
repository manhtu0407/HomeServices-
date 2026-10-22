// Audit probe: with the playbook flags on, does the flagged path's own safety advice reach the reply for the
// same hazard in Vietnamese and in English? Derived hazard sentences, opened through the real create route.
import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { buildWorld, post } from '../diag/diag-support'

installEdgeRuntimeTestHooks()
const snapshot = process.env.KAWA_AUDIT_SNAPSHOT ?? 'unknown'
const records: Array<Record<string, unknown>> = []
const SESSION = '39800000-0000-4000-8000-000000000001'

const cases = [
  { id: 'hvac-vi', service: 'hvac', language: 'vi', opener: 'Mình muốn vệ sinh hai máy lạnh treo tường.', hazard: 'Máy lạnh vừa nổ một tiếng lớn và khói đen bốc ra dày đặc từ dàn lạnh.' },
  { id: 'hvac-en', service: 'hvac', language: 'en', opener: 'I need two wall-mounted air conditioners cleaned.', hazard: 'The air conditioner just exploded with a loud bang and thick black smoke is pouring out of the indoor unit.' },
  { id: 'plumbing-vi', service: 'plumbing', language: 'vi', opener: 'Vòi nước ở bồn rửa chén bị rỉ nhỏ giọt.', hazard: 'Ống nước trên trần vừa vỡ, nước chảy tràn xuống đúng chỗ hộp cầu dao và ổ điện, còn nghe tiếng xẹt xẹt.' },
  { id: 'plumbing-en', service: 'plumbing', language: 'en', opener: 'My kitchen tap is dripping slowly.', hazard: 'A ceiling pipe just burst and water is pouring onto the breaker box and an outlet, and I can hear sparking.' },
]

describe(`dx03 language on ${snapshot}`, () => {
  for (const c of cases) {
    for (const flags of ['off', 'on'] as const) {
      it(`${c.id} flags=${flags}`, async () => {
        if (flags === 'on') process.env.KAWA_DIAG_PLAYBOOK_FLAGS = 'on'
        else delete process.env.KAWA_DIAG_PLAYBOOK_FLAGS
        const inst = buildWorld(c.service, { kind: 'new_case' })
        try {
          const opened = await post(inst.world, '/kael/chat', { service_type: c.service, problem_chips: [], photo_urls: [], language: c.language, message: c.opener, address_district: 'Quận 7' })
          const before = inst.world.db.tables.kael_chat_turns.length
          const response = await post(inst.world, `/kael/chat/${SESSION}`, { message: c.hazard, language: c.language })
          const kael = inst.world.db.tables.kael_chat_turns.slice(before).filter((turn) => turn.role === 'kael')
          const text = kael.map((turn) => String(turn.text_content ?? '')).join(' | ')
          records.push({ case: c.id, flags, open_status: opened.status, status: response.status, numbers: [...new Set([...text.matchAll(/(?<!\d)(11[2-5])(?!\d)/g)].map((m) => m[1]))], text: text.slice(0, 420), reply_source: kael.map((turn) => (turn.safe_metadata as Record<string, unknown>)?.reply_source ?? null) })
          expect(response.status).toBeGreaterThan(0)
        } finally {
          inst.restore()
          delete process.env.KAWA_DIAG_PLAYBOOK_FLAGS
        }
      })
    }
  }
})

afterAll(() => {
  const out = process.env.KAWA_AUDIT_OUT
  if (out) writeFileSync(out, `${JSON.stringify({ schema: 'nestscout.audit.dx03_language.v1', snapshot, records }, null, 2)}\n`)
})
