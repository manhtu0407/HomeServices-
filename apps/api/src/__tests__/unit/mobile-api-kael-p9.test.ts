import { describe, expect, it } from 'vitest'
import {
  buildNormalTransactionPlan,
  evaluateNormalTransactionMetrics,
  summarizeNormalTransactionLearning,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/case-1-normal'

describe('Kael P9 normal transaction case', () => {
  it('T9-test-1/2/8/9: builds Compact 6 happy path with skip rules and 5 customer notifications', () => {
    const plan = buildNormalTransactionPlan({
      serviceType: 'plumbing',
      hasMedia: true,
      descriptionCharCount: 80,
      visionConfidence: 0.74,
      matchLatencyMs: 3_000,
      bookingTiming: 'now',
      incidentReported: false,
      declineCount: 0,
    })

    expect(plan.phases.map((phase) => phase.name)).toEqual([
      'INTAKE',
      'CONFIRM',
      'MATCH',
      'EXECUTE',
      'COMPLETE',
      'LEARN',
    ])
    expect(plan.skips).toMatchObject({
      clarification: true,
      searchingNotification: true,
      onWayNotification: true,
      inspectingRepairingNotification: true,
      safetyLearning: true,
      declineLearning: true,
    })
    expect(plan.customerNotifications).toEqual([
      'estimate_ready',
      'worker_matched',
      'worker_arrived',
      'completed_by_worker',
      'review_thanks',
    ])
    expect(plan.customerNotificationBudget).toEqual({ max: 5, actual: 5, withinBudget: true })
    expect(plan.silentStatuses).toEqual(['worker_on_way', 'inspecting', 'repairing'])
  })

  it('T9-test-3/6: splits realtime memory from background learning and triggers LS1-LS5 only', () => {
    const learning = summarizeNormalTransactionLearning({
      reviewed: true,
      completedByWorker: true,
      incidentReported: false,
      declineCount: 0,
    })

    expect(learning.realtimeMemory).toEqual([
      'L2_job_memory',
      'L3_customer_satisfaction',
      'L4_worker_rating',
      'L5_ls1_evidence_increment',
    ])
    expect(learning.backgroundMemory).toEqual([
      'L3_customer_preference',
      'L4_worker_service_skill_proficiency',
      'L5_ls2_case_review',
      'L5_ls3_worker_pattern',
      'L5_ls4_customer_preference',
      'L5_ls5_service_knowledge',
    ])
    expect(learning.learningEvents).toEqual(['post-B7', 'post-A14'])
    expect(learning.skillIds).toEqual(['LS1', 'LS2', 'LS3', 'LS4', 'LS5'])
  })

  it('T9-test-4/5/7/10: evaluates metrics, repetition success, and Kael-owned final price', () => {
    expect(evaluateNormalTransactionMetrics({
      intakeLatencyMs: 8_900,
      totalCostUsd: 0.08,
      successCount: 10,
      repetitionCount: 10,
      finalPrice: 350000,
      kaelPriceMax: 350000,
    })).toMatchObject({
      latencyOk: true,
      costOk: true,
      repetitionsOk: true,
      finalPriceOk: true,
      pass: true,
    })

    expect(evaluateNormalTransactionMetrics({
      intakeLatencyMs: 9_100,
      totalCostUsd: 0.08,
      successCount: 10,
      repetitionCount: 10,
      finalPrice: 350000,
      kaelPriceMax: 350000,
    })).toMatchObject({ latencyOk: false, pass: false })
  })
})
