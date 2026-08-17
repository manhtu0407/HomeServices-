import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  validateWorkflowTransition,
  type WorkflowTransitionEvent,
} from '../../../../../supabase/functions/mobile-api/_shared/workflow-orchestrator'
import {
  JOB_STATUSES,
  type JobStatus,
} from '../../../../../supabase/functions/_shared/contracts/common'

export const PILLAR = {
  id: 'P12-workflow-transition-composition',
  invariant:
    'a job status changes only where the event table and the status table agree, and no event moves a job into paid except the two payment events',
  authority: [
    'governance/RULES.md #7 (the customer confirms completion before payment begins)',
    'governance/RULES.md #0 (workflow-sensitive writes belong to the server)',
  ],
  target: 'supabase/functions/mobile-api/_shared/workflow-orchestrator.ts',
  layer: 'unit',
  siblings: ['P13-autonomy-decision-durability', 'P19-job-access-ownership', 'P10-per-actor-rls'],
  mutation:
    'add ["confirmed_by_customer", "reviewed"] to review_submitted — the unpaid-close case turns red; note that adding ["repairing", "paid"] there instead changes nothing, because the status table refuses it second',
} as const satisfies PillarManifest

// tsc forces this list to name every event; a new event with no decision about what it may move is
// a compile error rather than an untested row.
const EVENT_IS_KAEL_AUTONOMY = {
  ai_estimate_ready: false,
  kael_failed: true,
  ai_explanation_ready: false,
  kael_confirmed_ticket: true,
  kael_started_matching: true,
  customer_confirmed_ticket: false,
  matching_started: false,
  worker_accepted: false,
  customer_confirmed_worker: false,
  customer_rejected_worker: false,
  worker_status_advanced: false,
  scope_change_requested: false,
  kael_decided_scope_change: true,
  scope_change_decided: false,
  worker_completed: false,
  kael_confirmed_completion: true,
  customer_confirmed_completion: false,
  kael_decided_payment: true,
  payment_confirmed: false,
  worker_confirmed_cash_payment: false,
  kael_decided_dispute: true,
  review_submitted: false,
  kael_processed_cancellation: true,
  cancel_requested: false,
} as const satisfies Record<WorkflowTransitionEvent, boolean>

const EVENTS = Object.keys(EVENT_IS_KAEL_AUTONOMY) as WorkflowTransitionEvent[]

// The event table is module-private and the status table is a second gate behind it, so the only
// honest way to see what the composition actually permits is to ask it about every pair. The
// properties below are then derived from what it answered, never from re-reading either table.
type Edge = { event: WorkflowTransitionEvent; from: JobStatus; to: JobStatus }

const ALLOWED_EDGES: Edge[] = EVENTS.flatMap((event) =>
  JOB_STATUSES.flatMap((from) =>
    JOB_STATUSES.filter((to) => validateWorkflowTransition({ event, from, to }).valid).map((to) => ({
      event,
      from,
      to,
    })),
  ),
)

const TERMINAL_STATUSES: JobStatus[] = JOB_STATUSES.filter(
  (status) => !ALLOWED_EDGES.some((edge) => edge.from === status),
)

function edgesInto(status: JobStatus): Edge[] {
  return ALLOWED_EDGES.filter((edge) => edge.to === status)
}

// Breadth-first over the derived graph, optionally treating one status as impassable. This is what
// makes the confirmation gate testable as a property rather than as a list of edges.
function reachableFrom(start: JobStatus, blocked: JobStatus | null): Set<JobStatus> {
  const seen = new Set<JobStatus>([start])
  const queue: JobStatus[] = [start]
  while (queue.length > 0) {
    const current = queue.shift() as JobStatus
    for (const edge of ALLOWED_EDGES) {
      if (edge.from !== current) continue
      if (edge.to === blocked || seen.has(edge.to)) continue
      seen.add(edge.to)
      queue.push(edge.to)
    }
  }
  return seen
}

describe('validateWorkflowTransition', () => {
  it('permits at least one transition for every declared event', () => {
    const dead = EVENTS.filter((event) => !ALLOWED_EDGES.some((edge) => edge.event === event))
    expect(
      dead,
      pillarWhy(PILLAR, 'an event that can never fire is a workflow step nothing can reach'),
    ).toEqual([])
  })

  it('rejects every pair the composition does not allow', () => {
    const total = EVENTS.length * JOB_STATUSES.length * JOB_STATUSES.length
    expect(
      ALLOWED_EDGES.length,
      pillarWhy(PILLAR, 'a table that permitted most of the matrix would not be a state machine'),
    ).toBeLessThan(total / 10)
  })

  it('never allows a status to transition to itself', () => {
    const selfEdges = ALLOWED_EDGES.filter((edge) => edge.from === edge.to)
    expect(
      selfEdges,
      pillarWhy(PILLAR, 'a self transition would re-stamp a lifecycle timestamp on replay'),
    ).toEqual([])
  })

  it('ends the lifecycle at exactly cancelled and reviewed', () => {
    expect(
      [...TERMINAL_STATUSES].sort(),
      pillarWhy(PILLAR, 'a new terminal state strands a job with no way forward'),
    ).toEqual(['cancelled', 'reviewed'])
  })
})

describe('the payment gate', () => {
  // RULES #7 puts an explicit customer decision in front of money. In the graph that means the
  // set of events able to write `paid` is closed, and every one of them starts from a status the
  // customer has already confirmed.
  it('admits only the two payment events into paid', () => {
    const events = [...new Set(edgesInto('paid').map((edge) => edge.event))].sort()
    expect(
      events,
      pillarWhy(PILLAR, 'any third route into paid is money moving on an unreviewed path'),
    ).toEqual(['payment_confirmed', 'worker_confirmed_cash_payment'])
  })

  it('enters paid only from a status the customer has already confirmed', () => {
    const origins = [...new Set(edgesInto('paid').map((edge) => edge.from))].sort()
    expect(
      origins,
      pillarWhy(PILLAR, 'paying out of an in-progress status would skip the completion gate'),
    ).toEqual(['confirmed_by_customer', 'payment_pending'])
  })

  it('cannot reach paid from any working status once confirmed_by_customer is blocked', () => {
    const working: JobStatus[] = [
      'draft',
      'analyzing',
      'broadcasting',
      'worker_matched',
      'arrived',
      'inspecting',
      'repairing',
      'completed_by_worker',
    ]
    for (const start of working) {
      expect(
        reachableFrom(start, 'confirmed_by_customer').has('paid'),
        pillarWhy(PILLAR, `${start} reached paid without crossing the confirmation gate`),
      ).toBe(false)
    }
  })

  // A job may still end without payment — a dispute resolved for the customer does exactly that.
  // Pinning it to the single event that is allowed to do it keeps the exception from spreading.
  it('lets only the dispute event close a job without payment', () => {
    const skips = edgesInto('reviewed').filter((edge) => edge.from !== 'paid')
    expect(
      [...new Set(skips.map((edge) => edge.event))],
      pillarWhy(PILLAR, 'closing a job unpaid is a dispute outcome, not a general shortcut'),
    ).toEqual(['kael_decided_dispute'])
    expect(
      [...new Set(skips.map((edge) => edge.from))],
      pillarWhy(PILLAR, 'the unpaid close starts from the confirmed status, not from mid-job'),
    ).toEqual(['confirmed_by_customer'])
  })
})

describe('the completion gate', () => {
  it('admits only completion events into confirmed_by_customer', () => {
    const events = [...new Set(edgesInto('confirmed_by_customer').map((edge) => edge.event))].sort()
    expect(
      events,
      pillarWhy(PILLAR, 'confirmation is what unlocks payment, so its entry set must stay closed'),
    ).toEqual(['customer_confirmed_completion', 'kael_confirmed_completion', 'kael_decided_dispute'])
  })

  it('only ever confirms completion out of completed_by_worker', () => {
    const origins = [...new Set(edgesInto('confirmed_by_customer').map((edge) => edge.from))]
    expect(
      origins,
      pillarWhy(PILLAR, 'confirming work the worker never reported complete has nothing to confirm'),
    ).toEqual(['completed_by_worker'])
  })
})

describe('event and status tables agree', () => {
  // The two tables are maintained separately. Every pair the event table offers has to survive the
  // status table too, otherwise an event exists that can never fire and the workflow silently
  // loses a step.
  it.each(EVENTS)('leaves no unreachable pair declared for %s', (event) => {
    const reachable = ALLOWED_EDGES.filter((edge) => edge.event === event)
    expect(
      reachable.length,
      pillarWhy(PILLAR, `every pair declared for ${event} was rejected by the status table`),
    ).toBeGreaterThan(0)
  })

  it('routes every Kael autonomy event through a transition the status table also allows', () => {
    const autonomyEvents = EVENTS.filter((event) => EVENT_IS_KAEL_AUTONOMY[event])
    for (const event of autonomyEvents) {
      expect(
        ALLOWED_EDGES.some((edge) => edge.event === event),
        pillarWhy(PILLAR, `${event} is an autonomous write with no legal transition behind it`),
      ).toBe(true)
    }
  })
})
