import { kaelNextActionsSchema, type KaelChatTurn, type KaelNextAction } from '@nestscout/shared'

// Kinds this screen can act on today. Anything else the server sends is skipped rather than shown
// as a button that does nothing.
const RENDERABLE_WORK_KINDS = new Set<KaelNextAction['kind']>([
  'provide_detail',
  'attach_photo',
  'request_worker_quote',
  'request_reference_price',
  'ask_question',
])

export type KaelWorkNextActions = {
  turnId: string
  actions: KaelNextAction[]
}

// Next steps belong to the conversation's newest turn only; once the customer has answered, the
// earlier suggestions are stale and disappear.
export function latestKaelNextActions(turns: readonly KaelChatTurn[]): KaelWorkNextActions | null {
  const last = turns[turns.length - 1]
  if (!last || last.role !== 'kael') return null
  const parsed = kaelNextActionsSchema.safeParse(last.next_actions ?? [])
  if (!parsed.success) return null
  const actions = parsed.data.filter((action) => RENDERABLE_WORK_KINDS.has(action.kind))
  return actions.length > 0 ? { turnId: last.id, actions } : null
}

// The newest labelled market reference, kept while the case is still waiting for a validated price.
export function latestKaelReferencePrice(
  turns: readonly KaelChatTurn[],
): NonNullable<KaelChatTurn['reference_price']> | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (turn.role !== 'kael') continue
    if (turn.reference_price) return turn.reference_price
    if (turn.estimate) return null
  }
  return null
}

export function formatReferenceUnit(unit: NonNullable<KaelChatTurn['reference_price']>['unit'], language: 'vi' | 'en') {
  if (language === 'en') return unit === 'per_visit' ? 'visit' : unit === 'per_repair_point' ? 'repair point' : 'item'
  return unit === 'per_visit' ? 'lượt' : unit === 'per_repair_point' ? 'điểm sửa' : 'món'
}
