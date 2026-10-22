import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { detectRequestedApplianceWork } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work'

export const PILLAR = {
  id: 'P431-kael-requested-work-english-negation',
  invariant:
    'an English request that refuses work on an appliance ("do not repair", "no need to check", "never fix") refuses the appliance and the fault described with it, so "Do not repair my washing machine that will not start; just fix the outlet." asks for no unsupported work, while the refusal ends at a contrast word or a new clause and the appliance that is asked for next, or beside a refusal that names something else, is still requested',
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
  ['Do not repair my washing machine that will not start; just fix the outlet.', 'a washing machine with a fault clause'],
  ['Do not fix my dryer which is stuck, just replace the outlet.', 'a dryer with a relative clause'],
  ["Don't repair the fridge, it's broken, only replace the outlet.", 'a fridge with a fault clause after a comma'],
  ['No need to check the microwave that is broken, just fix the outlet.', 'a microwave after "no need to"'],
  ['Never fix the washing machine that leaks, I only need a new socket.', 'a leaking washing machine after "never"'],
  ['Please do not service the dishwasher that does not drain; the switch is what needs replacing.', 'a dishwasher in a polite refusal'],
]

const STILL_REQUESTED: ReadonlyArray<readonly [string, readonly string[], string]> = [
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
