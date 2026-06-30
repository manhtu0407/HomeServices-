import { describe, it, expect } from 'vitest'
import {
  canTransition,
  getValidTransitions,
  isTerminalStatus,
  getTimestampColumn,
  validateTransition,
  WORKER_UPDATABLE_STATUSES,
  CUSTOMER_GATE_STATUSES,
} from '@/lib/jobs/lifecycle'
import { JOB_STATUSES } from '@nestscout/shared'

describe('lifecycle — canTransition', () => {
  it('allows draft → analyzing', () => {
    expect(canTransition('draft', 'analyzing')).toBe(true)
  })

  it('allows draft → cancelled', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true)
  })

  it('rejects draft → broadcasting (skip states)', () => {
    expect(canTransition('draft', 'broadcasting')).toBe(false)
  })

  it('allows analyzing → estimate_ready', () => {
    expect(canTransition('analyzing', 'estimate_ready')).toBe(true)
  })

  // E9: analyzing → cancelled allows clean termination on pipeline failure
  // instead of leaving orphan draft jobs invisible to customer.
  it('allows analyzing → cancelled (E9: orphan draft cleanup)', () => {
    expect(canTransition('analyzing', 'cancelled')).toBe(true)
  })

  it('allows analyzing → draft (fallback on failure)', () => {
    expect(canTransition('analyzing', 'draft')).toBe(true)
  })

  it('allows estimate_ready → awaiting_customer_confirm', () => {
    expect(canTransition('estimate_ready', 'awaiting_customer_confirm')).toBe(true)
  })

  it('allows awaiting_customer_confirm → broadcasting', () => {
    expect(canTransition('awaiting_customer_confirm', 'broadcasting')).toBe(true)
  })

  it('allows awaiting_customer_confirm → cancelled', () => {
    expect(canTransition('awaiting_customer_confirm', 'cancelled')).toBe(true)
  })

  it('allows broadcasting → worker_matched', () => {
    expect(canTransition('broadcasting', 'worker_matched')).toBe(true)
  })

  it('allows worker_matched → worker_on_way', () => {
    expect(canTransition('worker_matched', 'worker_on_way')).toBe(true)
  })

  it('allows worker_on_way → arrived', () => {
    expect(canTransition('worker_on_way', 'arrived')).toBe(true)
  })

  it('allows arrived → inspecting', () => {
    expect(canTransition('arrived', 'inspecting')).toBe(true)
  })

  it('allows active customer-cancelled phases to terminate', () => {
    expect(canTransition('arrived', 'cancelled')).toBe(true)
    expect(canTransition('inspecting', 'cancelled')).toBe(true)
    expect(canTransition('repairing', 'cancelled')).toBe(true)
    expect(canTransition('scope_change_pending', 'cancelled')).toBe(true)
  })

  it('allows inspecting → repairing', () => {
    expect(canTransition('inspecting', 'repairing')).toBe(true)
  })

  it('allows inspecting → scope_change_pending', () => {
    expect(canTransition('inspecting', 'scope_change_pending')).toBe(true)
  })

  it('allows repairing → completed_by_worker', () => {
    expect(canTransition('repairing', 'completed_by_worker')).toBe(true)
  })

  it('allows repairing → scope_change_pending', () => {
    expect(canTransition('repairing', 'scope_change_pending')).toBe(true)
  })

  it('allows scope_change_pending → repairing', () => {
    expect(canTransition('scope_change_pending', 'repairing')).toBe(true)
  })

  it('allows completed_by_worker → confirmed_by_customer', () => {
    expect(canTransition('completed_by_worker', 'confirmed_by_customer')).toBe(true)
  })

  it('allows confirmed_by_customer → payment_pending', () => {
    expect(canTransition('confirmed_by_customer', 'payment_pending')).toBe(true)
  })

  it('allows confirmed_by_customer → reviewed', () => {
    expect(canTransition('confirmed_by_customer', 'reviewed')).toBe(true)
  })

  it('allows payment_pending → paid', () => {
    expect(canTransition('payment_pending', 'paid')).toBe(true)
  })

  it('allows paid → reviewed', () => {
    expect(canTransition('paid', 'reviewed')).toBe(true)
  })

  it('rejects completed_by_worker → paid (A12 bypass)', () => {
    expect(canTransition('completed_by_worker', 'paid')).toBe(false)
  })

  it('rejects draft → paid', () => {
    expect(canTransition('draft', 'paid')).toBe(false)
  })

  it('rejects reviewed → anything (terminal)', () => {
    expect(canTransition('reviewed', 'draft')).toBe(false)
    expect(canTransition('reviewed', 'cancelled')).toBe(false)
  })

  it('rejects cancelled → anything (terminal)', () => {
    expect(canTransition('cancelled', 'draft')).toBe(false)
    expect(canTransition('cancelled', 'broadcasting')).toBe(false)
  })
})

describe('lifecycle — getValidTransitions', () => {
  it('returns correct transitions for draft', () => {
    const transitions = getValidTransitions('draft')
    expect(transitions).toContain('analyzing')
    expect(transitions).toContain('cancelled')
    expect(transitions).toHaveLength(2)
  })

  it('returns empty array for terminal states', () => {
    expect(getValidTransitions('reviewed')).toHaveLength(0)
    expect(getValidTransitions('cancelled')).toHaveLength(0)
  })

  it('returns transitions for inspecting (branch point)', () => {
    const transitions = getValidTransitions('inspecting')
    expect(transitions).toContain('repairing')
    expect(transitions).toContain('scope_change_pending')
    expect(transitions).toContain('cancelled')
    expect(transitions).toHaveLength(3)
  })
})

describe('lifecycle — isTerminalStatus', () => {
  it('reviewed is terminal', () => {
    expect(isTerminalStatus('reviewed')).toBe(true)
  })

  it('cancelled is terminal', () => {
    expect(isTerminalStatus('cancelled')).toBe(true)
  })

  it('draft is not terminal', () => {
    expect(isTerminalStatus('draft')).toBe(false)
  })

  it('paid is not terminal', () => {
    expect(isTerminalStatus('paid')).toBe(false)
  })
})

describe('lifecycle — getTimestampColumn', () => {
  it('returns broadcast_at for broadcasting', () => {
    expect(getTimestampColumn('broadcasting')).toBe('broadcast_at')
  })

  it('returns matched_at for worker_matched', () => {
    expect(getTimestampColumn('worker_matched')).toBe('matched_at')
  })

  it('returns arrived_at for arrived', () => {
    expect(getTimestampColumn('arrived')).toBe('arrived_at')
  })

  it('returns completed_at for completed_by_worker', () => {
    expect(getTimestampColumn('completed_by_worker')).toBe('completed_at')
  })

  it('returns confirmed_at for confirmed_by_customer', () => {
    expect(getTimestampColumn('confirmed_by_customer')).toBe('confirmed_at')
  })

  it('returns paid_at for paid', () => {
    expect(getTimestampColumn('paid')).toBe('paid_at')
  })

  it('returns cancelled_at for cancelled', () => {
    expect(getTimestampColumn('cancelled')).toBe('cancelled_at')
  })

  it('returns reviewed_at for reviewed', () => {
    expect(getTimestampColumn('reviewed')).toBe('reviewed_at')
  })

  it('returns null for statuses without timestamp mapping', () => {
    expect(getTimestampColumn('inspecting')).toBeNull()
    expect(getTimestampColumn('repairing')).toBeNull()
  })
})

describe('lifecycle — validateTransition', () => {
  it('returns valid for allowed transition', () => {
    const result = validateTransition('draft', 'analyzing')
    expect(result.valid).toBe(true)
  })

  it('returns invalid for terminal status', () => {
    const result = validateTransition('reviewed', 'draft')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('kết thúc')
    }
  })

  it('returns invalid for disallowed transition', () => {
    const result = validateTransition('draft', 'paid')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('draft')
      expect(result.error).toContain('paid')
    }
  })

  it('includes timestamp column for valid transition', () => {
    const result = validateTransition('broadcasting', 'worker_matched')
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.timestampColumn).toBe('matched_at')
    }
  })
})

describe('lifecycle — every JOB_STATUS is in transition map', () => {
  for (const status of JOB_STATUSES) {
    it(`status '${status}' has a transition entry`, () => {
      const transitions = getValidTransitions(status)
      expect(Array.isArray(transitions)).toBe(true)
    })
  }
})

describe('lifecycle — exported constants', () => {
  it('WORKER_UPDATABLE_STATUSES includes expected statuses', () => {
    expect(WORKER_UPDATABLE_STATUSES).toContain('worker_on_way')
    expect(WORKER_UPDATABLE_STATUSES).toContain('arrived')
    expect(WORKER_UPDATABLE_STATUSES).toContain('inspecting')
    expect(WORKER_UPDATABLE_STATUSES).toContain('repairing')
    expect(WORKER_UPDATABLE_STATUSES).toContain('completed_by_worker')
  })

  it('CUSTOMER_GATE_STATUSES includes expected statuses', () => {
    expect(CUSTOMER_GATE_STATUSES).toContain('broadcasting')
    expect(CUSTOMER_GATE_STATUSES).toContain('confirmed_by_customer')
  })
})
