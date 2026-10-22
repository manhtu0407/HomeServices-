import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { detectRequestedApplianceWork } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work'

export const PILLAR = {
  id: 'P431-kael-requested-work-english-negation',
  invariant:
    'English refusals, explicit exclusions and completed work suppress only their appliance and described historical fault; negated fault adjectives stay quiet while genuine nonfunctioning, same-subject new faults and separately requested repairs remain unsupported work',
  authority: [
    'governance/RULES.md #6 (an unsupported topic closes a Case only when the customer asks for that work)',
    'KAWA_01 six-service diagnostic DX-01 (a mention is not a request)',
    'PR 406 review (Codex P2 on the English negation of a described fault)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work.ts',
  layer: 'unit',
  siblings: ['P421-kael-boundary-requested-work', 'P429-kael-boundary-language-supply'],
  mutation:
    'blank only the negated act and leave the appliance and its fault (the previous English pattern): the washing machine, dryer, fridge and microwave refusal rows ask for the appliance again while the genuine-request rows stay green',
} as const satisfies PillarManifest

const requested = (text: string) => [...detectRequestedApplianceWork(text, 'electrical')].sort()

const REFUSED: ReadonlyArray<readonly [string, string]> = [
  ['We already repaired the fridge and it was broken. Please fix the outlet.', 'the same historical subject remains completed'],
  ['Tủ lạnh đặt cạnh cái ổ cắm điện đã bị hỏng, nhờ sửa ổ cắm.', 'a different fixture after placement'],
  ['Máy giặt đặt cạnh ổ cắm đang bị hỏng, nhờ sửa ổ cắm.', 'a placed appliance is incidental to outlet work'],
  ['We already repaired the dishwasher that was broken. Please fix the outlet.', 'completed work covers its historical fault'],
  ['We previously fixed the fridge which was faulty. Please repair the outlet.', 'previously completed work'],
  ['Please fix the faucet, excluding the washing machine that will not start.', 'an excluded English appliance alias'],
  ['My fridge works fine but the outlet is broken. Please fix the outlet.', 'another subject after but'],
  ['My washing machine is fine and the outlet is broken. Please fix the outlet.', 'another subject after and'],
  ['My dishwasher works fine while the faucet is leaking. Please repair the faucet.', 'another subject after while'],
  ['Repair the outlet behind the fridge and my washing machine.', 'coordinated incidental locations'],
  ['My fridge is not broken. Please repair the outlet.', 'a negated broken adjective'],
  ['My washing machine is not faulty, please repair the outlet.', 'a negated faulty adjective'],
  ["The dishwasher isn't leaking. Please fix the socket.", 'a contracted negated fault'],
  ['My dryer is not stuck. Please repair the light switch.', 'a negated stuck adjective'],
  ['Do not repair my washing machine that will not start; just fix the outlet.', 'a washing machine with a fault clause'],
  ['Do not fix my dryer which is stuck, just replace the outlet.', 'a dryer with a relative clause'],
  ["Don't repair the fridge, it's broken, only replace the outlet.", 'a fridge with a fault clause after a comma'],
  ['No need to check the microwave that is broken, just fix the outlet.', 'a microwave after "no need to"'],
  ['Never fix the washing machine that leaks, I only need a new socket.', 'a leaking washing machine after "never"'],
  ['Please do not service the dishwasher that does not drain; the switch is what needs replacing.', 'a dishwasher in a polite refusal'],
]

const STILL_REQUESTED: ReadonlyArray<readonly [string, readonly string[], string]> = [
  ['Máy giặt cạnh ổ cắm không xả nước, nhờ kiểm tra.', ['may giat'], 'draining remains an appliance function after placement'],
  ['Tủ lạnh cạnh ổ cắm không làm đá, nhờ kiểm tra.', ['tu lanh'], 'ice making remains an appliance function after placement'],
  ['May giat canh o cam does not drain.', ['may giat'], 'the shared English function grammar remains active'],
  ['We already repaired the outlet and now my washing machine will not start, please repair it.', ['may giat'], 'a new subject and current fault after completed work'],
  ['We previously fixed the faucet and the fridge is broken, please repair it.', ['tu lanh'], 'a new faulty subject without now'],
  ['We already repaired the outlet and currently our dishwasher does not work.', ['may rua bat'], 'a current subject after a completion'],
  ['Tủ lạnh trong phòng bếp bị hỏng, nhờ sửa.', ['tu lanh'], 'a room location does not erase an appliance fault'],
  ['May giat dat canh o cam khong vat.', ['may giat'], 'an appliance-specific function remains its own fault'],
  ['We already repaired the dishwasher that was broken, but repair the washing machine.', ['may giat'], 'new work after completed work'],
  ['We already repaired the dishwasher that was broken and please repair the fridge.', ['tu lanh'], 'new work after and'],
  ['Please fix the faucet, excluding the washing machine but repair the fridge.', ['tu lanh'], 'a request after an exclusion contrast'],
  ['Please repair the outlet and my washing machine.', ['may giat'], 'coordinated appliance work is still requested'],
  ['My fridge was fine but now broken.', ['tu lanh'], 'a same-subject contrast still describes an appliance fault'],
  ['My washing machine and its motor are broken.', ['may giat'], 'a component of the same appliance is faulty'],
  ['My washing machine is not working. Please repair it.', ['may giat'], 'a negative functioning predicate is a real fault'],
  ['My fridge is not broken, but please repair my dryer.', ['may say'], 'a separate affirmative appliance request'],
  ['Please repair my washing machine that will not start.', ['may giat'], 'a plain request'],
  ['Do not repair my fridge, but repair my washing machine that will not start.', ['may giat'], 'a refusal then a contrast'],
  ['Do not repair the outlet, fix my washing machine.', ['may giat'], 'a refusal that names something else'],
  ['Do not worry, please repair my fridge that is broken.', ['tu lanh'], 'a phrase that only starts like a refusal'],
  ['Do not repair my fridge. Fix my washing machine that will not start.', ['may giat'], 'a refusal then a new sentence'],
  ['Never mind the quote, please check the microwave that is broken.', ['lo vi song'], '"never" that is not a refusal of work'],
]

describe(`${PILLAR.id}: a refusal covers the appliance and its fault`, () => {
  it.each(REFUSED)('%s asks for no unsupported work (%s)', (text, label) => {
    expect(requested(text), pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)}`)).toEqual([])
  })
})

describe(`${PILLAR.id}: the work that is asked for next is still requested`, () => {
  it.each(STILL_REQUESTED)('%s asks for %j (%s)', (text, wanted, label) => {
    expect(requested(text), pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)}`)).toEqual(wanted)
  })
})
