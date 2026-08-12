import { describe, expect, it } from 'vitest'
import { JOB_STATUSES, PROBLEM_CHIPS } from '../constants'
import {
  createInitialLocalWorkflowState,
  inferLocalDealDraftFromKael,
  isLocalDealStatus,
  LOCAL_DEAL_STATUSES,
  LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  localWorkflowReducer,
  selectLocalWorkflow,
  statusLabel,
  toLocalDealStatus,
  validateLocalDealDraft,
  type LocalWorkflowAction,
  type LocalWorkflowState,
} from '../mobile-workflow'

const reduce = (actions: LocalWorkflowAction[]): LocalWorkflowState =>
  actions.reduce(localWorkflowReducer, createInitialLocalWorkflowState())

const validBookingActions: LocalWorkflowAction[] = [
  { type: 'start_home_service', serviceType: 'plumbing' },
  {
    type: 'update_booking_draft',
    patch: {
      addressLabel: 'Block A, Quận 7, TP.HCM',
      description: 'Vòi nước dưới lavabo rò liên tục, đã khóa van phụ.',
      mediaCount: 1,
      problemChips: [PROBLEM_CHIPS.plumbing[0]],
    },
  },
  { type: 'submit_booking_draft' },
  { type: 'finish_local_analysis' },
]

describe('mobile local workflow state machine', () => {
  it('keeps the frontend-only lifecycle aligned to the approved PR#12 subset', () => {
    expect([...LOCAL_DEAL_STATUSES]).toEqual([
      'draft',
      'analyzing',
      'estimate_ready',
      'awaiting_customer_confirm',
      'broadcasting',
      'worker_candidate_pending',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
      'confirmed_by_customer',
      'payment_pending',
      'paid',
      'reviewed',
      'cancelled',
    ])
  })

  it('keeps local statuses as a documented subset of backend job statuses', () => {
    for (const status of LOCAL_DEAL_STATUSES) {
      expect(JOB_STATUSES).toContain(status)
      expect(isLocalDealStatus(status)).toBe(true)
    }
  })

  it('maps every backend job status into a local mobile status', () => {
    for (const status of JOB_STATUSES) {
      expect(LOCAL_DEAL_STATUSES).toContain(toLocalDealStatus(status))
    }

    expect(toLocalDealStatus('estimate_ready')).toBe('estimate_ready')
    expect(toLocalDealStatus('payment_pending')).toBe('payment_pending')
    expect(toLocalDealStatus('paid')).toBe('paid')
  })

  it('starts empty and does not fabricate a booking, worker, price, payment, or review', () => {
    const state = createInitialLocalWorkflowState()
    const selectors = selectLocalWorkflow(state)

    expect(state.deal).toBeNull()
    expect(selectors.currentStatus).toBeNull()
    expect(selectors.hasLocalBroadcast).toBe(false)
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
    expect(selectors.canCustomerCancelDeal).toBe(false)
    expect(selectors.paymentLocked).toBe(true)
    expect(selectors.reviewLocked).toBe(true)
  })

  it('hands off home service cards into a draft without broadcasting or defaulting to another service', () => {
    const state = reduce([{ type: 'start_home_service', serviceType: 'plumbing' }])
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('draft')
    expect(state.deal?.draft.serviceType).toBe('plumbing')
    expect(state.deal?.draft.problemChips).toEqual([])
    expect(state.deal?.draft.timeChoice).toBe('now')
    expect(selectors.canConfirmCustomerSearch).toBe(false)
    expect(selectors.hasLocalBroadcast).toBe(false)
  })

  it('infers Kael draft service only when the customer text is clear', () => {
    const plumbing = inferLocalDealDraftFromKael('Vòi nước bếp bị rò liên tục ở quận 7')
    const ambiguous = inferLocalDealDraftFromKael('Trong căn hộ có vấn đề cần kiểm tra giúp tôi')

    expect(plumbing.serviceType).toBe('plumbing')
    expect(plumbing.needsServiceChoice).toBe(false)
    expect(plumbing.problemChips).toContain(PROBLEM_CHIPS.plumbing[0])
    expect(ambiguous.serviceType).toBeNull()
    expect(ambiguous.needsServiceChoice).toBe(true)
    expect(ambiguous.problemChips).toEqual([])
  })

  it('recognizes an explicit Vietnamese plumbing service request', () => {
    const directPlumbing = inferLocalDealDraftFromKael('Tôi chọn dịch vụ sửa nước, cần kiểm tra sớm.')

    expect(directPlumbing.serviceType).toBe('plumbing')
    expect(directPlumbing.needsServiceChoice).toBe(false)
  })

  it('does not infer a single service when Kael text mentions both electrical and plumbing work', () => {
    const draft = inferLocalDealDraftFromKael('Ổ cắm phòng khách bị nóng và vòi nước lavabo cũng rò liên tục')

    expect(draft.serviceType).toBeNull()
    expect(draft.needsServiceChoice).toBe(true)
    expect(draft.problemChips).toEqual([])
  })

  it('rejects too-short Kael text instead of creating a weak draft', () => {
    const state = reduce([{ type: 'submit_kael_draft', text: 'ổ' }])

    expect(state.deal).toBeNull()
    expect(state.lastError).toContain('Mô tả Kael cần rõ hơn')
  })

  it('does not confuse electrical switch wording with plumbing drain wording', () => {
    const draft = inferLocalDealDraftFromKael('Công tắc đèn phòng ngủ bị lỏng và lúc bật lúc tắt')

    expect(draft.serviceType).toBe('electrical')
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.problemChips).toContain(PROBLEM_CHIPS.electrical[2])
  })

  it('infers electrical switch wording even without an extra electrical keyword', () => {
    const draft = inferLocalDealDraftFromKael('Công tắc phòng ngủ bị lỏng, cần thay hoặc siết lại')

    expect(draft.serviceType).toBe('electrical')
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.problemChips).toContain(PROBLEM_CHIPS.electrical[2])
  })

  it('infers electrical outlet wording from ổ điện without forcing manual service choice', () => {
    const draft = inferLocalDealDraftFromKael('Ổ điện phòng khách bị lỏng, cắm thiết bị vào chập chờn')

    expect(draft.serviceType).toBe('electrical')
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.problemChips).toContain(PROBLEM_CHIPS.electrical[2])
  })

  it('still infers plumbing clog wording when tắc is a real drain problem', () => {
    const draft = inferLocalDealDraftFromKael('Bồn rửa bếp bị tắc nước, cần thông lại trong hôm nay')

    expect(draft.serviceType).toBe('plumbing')
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.problemChips).toContain(PROBLEM_CHIPS.plumbing[1])
  })

  it('does not treat supported electrical device wording as a locked appliance service', () => {
    const draft = inferLocalDealDraftFromKael('Thiết bị điện trong bếp bị chập nhẹ và cần kiểm tra dây')

    expect(draft.serviceType).toBe('electrical')
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.unsupportedServiceLabel).toBeNull()
  })

  it('does not treat plumbing shutoff language as a door-lock service', () => {
    const draft = inferLocalDealDraftFromKael('Vòi nước lavabo bị rò liên tục, tôi đã khóa van phụ ở quận 7')

    expect(draft.serviceType).toBe('plumbing')
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.problemChips).toContain(PROBLEM_CHIPS.plumbing[0])
    expect(draft.unsupportedServiceLabel).toBeNull()
  })

  it.each([
    ['vi', 'electrical', 'Ổ cắm phòng khách bị chập điện và cần kiểm tra ngay'],
    ['en', 'electrical', 'The bedroom electrical outlet is sparking and needs repair'],
    ['vi', 'electrical', 'Cần lắp máy nước nóng mới trong phòng tắm'],
    ['en', 'electrical', 'Need to install a new water heater in the bathroom'],
    ['vi', 'plumbing', 'Ống nước dưới lavabo bị rò rỉ và cần sửa trong hôm nay'],
    ['en', 'plumbing', 'The bathroom pipe is leaking and needs repair today'],
    ['vi', 'cleaning', 'Cần tổng vệ sinh căn hộ sau khi chuyển đồ xong'],
    ['en', 'cleaning', 'Need a full apartment cleaning after moving the furniture'],
    ['vi', 'hvac', 'Máy lạnh phòng ngủ không mát và đang chảy nước'],
    ['en', 'hvac', 'The air conditioner is not cooling and is leaking water'],
    ['vi', 'upholstery', 'Cần vệ sinh sofa và nệm bị bẩn trong phòng khách'],
    ['en', 'upholstery', 'Need sofa and mattress cleaning in the living room'],
    ['vi', 'handyman', 'Cần khoan lắp kệ và sửa bản lề cửa bị lỏng'],
    ['en', 'handyman', 'Need a shelf installed and a loose door hinge repaired'],
  ] as const)('infers a valid %s %s Kael draft', (_language, expectedService, text) => {
    const draft = inferLocalDealDraftFromKael(text)

    expect(draft.serviceType).toBe(expectedService)
    expect(draft.needsServiceChoice).toBe(false)
    expect(draft.problemChips).toHaveLength(1)
    expect(draft.unsupportedServiceLabel).toBeNull()
    expect(validateLocalDealDraft({ ...draft, addressLabel: 'Quận 7, TP.HCM' })).toBeNull()
  })

  it.each([
    ['electrical', PROBLEM_CHIPS.electrical[4], 'Đèn phòng ngủ không sáng dù đã thay bóng'],
    ['plumbing', PROBLEM_CHIPS.plumbing[4], 'Nước trong căn hộ rất yếu và cần kiểm tra đường cấp'],
    ['cleaning', PROBLEM_CHIPS.cleaning[0], 'Căn hộ nhiều bụi và cần lau nhà trước cuối tuần'],
  ] as const)('preserves common %s signals from the original three-service intake', (expectedService, expectedProblem, text) => {
    const draft = inferLocalDealDraftFromKael(text)

    expect(draft.serviceType).toBe(expectedService)
    expect(draft.problemChips).toEqual([expectedProblem])
  })

  it.each([
    ['vi', 'handyman', PROBLEM_CHIPS.handyman[1], 'Cần lắp thanh rèm mới trong phòng ngủ'],
    ['en', 'handyman', PROBLEM_CHIPS.handyman[1], 'Need to install a curtain rod in the bedroom'],
    ['vi', 'upholstery', PROBLEM_CHIPS.upholstery[2], 'Cần vệ sinh rèm bị bám bụi trong phòng ngủ'],
    ['en', 'upholstery', PROBLEM_CHIPS.upholstery[2], 'Need curtain cleaning for the bedroom'],
  ] as const)('distinguishes %s curtain installation from fabric care', (_language, expectedService, expectedProblem, text) => {
    const draft = inferLocalDealDraftFromKael(text)

    expect(draft.serviceType).toBe(expectedService)
    expect(draft.problemChips).toEqual([expectedProblem])
  })

  it.each([
    ['vi', 'Tôi cần sửa xe máy bị chết máy trong tầng hầm'],
    ['en', 'I need motorcycle repair in the apartment basement'],
  ] as const)('flags an unsupported %s Kael request', (_language, text) => {
    const draft = inferLocalDealDraftFromKael(text)

    expect(draft.serviceType).toBeNull()
    expect(draft.needsServiceChoice).toBe(true)
    expect(draft.problemChips).toEqual([])
    expect(draft.unsupportedServiceLabel).toContain('điều hòa và không khí')
    expect(draft.unsupportedServiceLabel).toContain('sửa vặt và lắp đặt nhỏ')
  })

  it('does not infer one service when HVAC and plumbing are both requested', () => {
    const draft = inferLocalDealDraftFromKael('Máy lạnh đang chảy nước và vòi lavabo cũng bị rò')

    expect(draft.serviceType).toBeNull()
    expect(draft.needsServiceChoice).toBe(true)
    expect(draft.problemChips).toEqual([])
    expect(draft.unsupportedServiceLabel).toBeNull()
  })

  it('keeps curtain installation ambiguous when a separate fabric-care request is also present', () => {
    const draft = inferLocalDealDraftFromKael('Cần vệ sinh sofa và lắp thanh rèm trong phòng ngủ')

    expect(draft.serviceType).toBeNull()
    expect(draft.needsServiceChoice).toBe(true)
    expect(draft.problemChips).toEqual([])
  })

  it('names the complete supported service set when validation needs a service choice', () => {
    const draft = inferLocalDealDraftFromKael('Trong căn hộ có vấn đề cần kiểm tra giúp tôi')

    expect(validateLocalDealDraft(draft)).toBe('Chọn một trong sáu dịch vụ NestScout hỗ trợ')
  })

  it('clears unsupported Kael hints after the customer explicitly chooses a supported service in booking', () => {
    const unsupported = reduce([{ type: 'submit_kael_draft', text: 'Tôi cần sửa xe máy bị chết máy trong tầng hầm' }])
    expect(unsupported.deal?.draft.unsupportedServiceLabel).not.toBeNull()
    const corrected = localWorkflowReducer(unsupported, {
      type: 'update_booking_draft',
      patch: {
        serviceType: 'electrical',
        problemChips: [PROBLEM_CHIPS.electrical[2]],
        description: 'Công tắc đèn phòng ngủ lúc bật lúc tắt, cần kiểm tra.',
        addressLabel: 'Quận 7, TP.HCM',
      },
    })

    expect(corrected.deal?.draft.serviceType).toBe('electrical')
    expect(corrected.deal?.draft.unsupportedServiceLabel).toBeNull()
    expect(selectLocalWorkflow(corrected).draftValidationMessage).toBeNull()
  })

  it('moves booking to a local broadcast with remote estimate placeholder and now-only schedule', () => {
    const state = reduce(validBookingActions)
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('broadcasting')
    expect(state.deal?.broadcast?.status).toBe('sent')
    expect(state.deal?.draft.timeChoice).toBe('now')
    expect(state.deal?.estimate?.priceRangeLabel).toBe('Chờ Kael ước tính')
    expect(state.deal?.estimate?.hasVndPrice).toBe(false)
    expect(state.deal?.estimate?.disclaimer).toContain('Kael')
    expect(selectors.scheduleMode).toBe('now_only')
    expect(selectors.canConfirmCustomerSearch).toBe(false)
  })

  it('blocks analysis when a booking has no explicit problem chip', () => {
    const state = reduce([
      { type: 'start_home_service', serviceType: 'electrical' },
      {
        type: 'update_booking_draft',
        patch: {
          addressLabel: 'Quận 7, TP.HCM',
          description: 'Công tắc đèn phòng ngủ lúc bật lúc tắt, cần kiểm tra sớm.',
          problemChips: [],
        },
      },
      { type: 'submit_booking_draft' },
    ])
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('draft')
    expect(state.lastError).toContain('Chọn ít nhất một vấn đề')
    expect(selectors.canConfirmCustomerSearch).toBe(false)
  })

  it('blocks analysis when the booking address has no concrete HCMC district', () => {
    const state = reduce([
      { type: 'start_home_service', serviceType: 'plumbing' },
      {
        type: 'update_booking_draft',
        patch: {
          addressLabel: 'Thanh Xuan, Ha Noi',
          description: 'Vòi nước dưới lavabo rò liên tục, đã khóa van phụ.',
          problemChips: [PROBLEM_CHIPS.plumbing[0]],
        },
      },
      { type: 'submit_booking_draft' },
    ])
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('draft')
    expect(state.lastError).toContain('quận TP.HCM')
    expect(selectors.canConfirmCustomerSearch).toBe(false)
  })

  it('blocks customer search confirmation if the estimate step did not complete', () => {
    const awaitingConfirm = reduce(validBookingActions)
    const withoutEstimate = {
      ...awaitingConfirm,
      deal: awaitingConfirm.deal
        ? {
            ...awaitingConfirm.deal,
            estimate: null,
          }
        : null,
    }
    const attempted = localWorkflowReducer(withoutEstimate, { type: 'confirm_customer_search' })

    expect(selectLocalWorkflow(withoutEstimate).canConfirmCustomerSearch).toBe(false)
    expect(attempted.deal?.status).toBe('broadcasting')
    expect(attempted.lastError).toContain('ước tính')
  })

  it('creates a local broadcast only after explicit customer search confirmation', () => {
    const state = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('broadcasting')
    expect(state.workerGate).toBe('local_deal_audit')
    expect(state.deal?.broadcast?.status).toBe('sent')
    expect(state.deal?.broadcast?.generalArea).toBe('Quận 7')
    expect(state.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(state.deal?.broadcast?.fullAddressLabel).toBeNull()
    expect(state.deal?.broadcast?.prebrief.join(' ')).not.toContain('Block A')
    expect(selectors.hasLocalBroadcast).toBe(true)
    expect(selectors.canWorkerAccept).toBe(true)
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
    expect(selectors.canCustomerCancelDeal).toBe(true)
  })

  it('ticks and expires the local worker broadcast without fabricating a match', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const ticked = localWorkflowReducer(broadcasting, { type: 'tick_broadcast' })

    expect(ticked.deal?.broadcast?.secondsRemaining).toBe(59)
    expect(ticked.deal?.broadcast?.status).toBe('sent')
    expect(selectLocalWorkflow(ticked).customerSearchState).toBe('searching')

    const almostExpired = {
      ...broadcasting,
      deal: broadcasting.deal
        ? {
            ...broadcasting.deal,
            broadcast: broadcasting.deal.broadcast
              ? {
                  ...broadcasting.deal.broadcast,
                  secondsRemaining: 1,
                }
              : null,
          }
        : null,
    }
    const expired = localWorkflowReducer(almostExpired, { type: 'tick_broadcast' })
    const selectors = selectLocalWorkflow(expired)

    expect(expired.deal?.status).toBe('broadcasting')
    expect(expired.deal?.broadcast?.status).toBe('expired')
    expect(expired.deal?.broadcast?.secondsRemaining).toBe(0)
    expect(expired.workerGate).toBe('backend_pending')
    expect(selectors.customerSearchState).toBe('no_worker')
    expect(selectors.canWorkerAccept).toBe(false)
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
  })

  it('reveals the full address to worker only after local accept', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const accepted = localWorkflowReducer(broadcasting, { type: 'worker_accept_broadcast' })
    const selectors = selectLocalWorkflow(accepted)

    expect(accepted.deal?.status).toBe('worker_matched')
    expect(accepted.deal?.broadcast?.status).toBe('accepted')
    expect(accepted.deal?.broadcast?.fullAddressVisible).toBe(true)
    expect(accepted.deal?.broadcast?.fullAddressLabel).toBe('Block A, Quận 7, TP.HCM')
    expect(selectors.canWorkerSeeFullAddress).toBe(true)
  })

  it('blocks worker accept when the local audit gate is not open', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const gatedOff = localWorkflowReducer({ ...broadcasting, workerGate: 'backend_pending' }, { type: 'worker_accept_broadcast' })

    expect(gatedOff.deal?.status).toBe('broadcasting')
    expect(gatedOff.deal?.broadcast?.status).toBe('sent')
    expect(gatedOff.lastError).toContain('workflow')
    expect(selectLocalWorkflow(gatedOff).canWorkerAccept).toBe(false)
  })

  it('blocks worker decline when the local audit gate is not open', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const gatedOff = localWorkflowReducer({ ...broadcasting, workerGate: 'backend_pending' }, { type: 'worker_decline_broadcast' })

    expect(gatedOff.deal?.status).toBe('broadcasting')
    expect(gatedOff.deal?.broadcast?.status).toBe('sent')
    expect(gatedOff.lastError).toContain('workflow')
    expect(selectLocalWorkflow(gatedOff).customerSearchState).toBe('searching')
  })

  it('blocks illegal worker/customer jumps and allows the approved completion path', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const illegal = localWorkflowReducer(broadcasting, { type: 'worker_complete_job' })
    expect(illegal.deal?.status).toBe('broadcasting')
    expect(illegal.lastError).toContain('Không thể chuyển')

    const completed = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
      { type: 'worker_start_inspection' },
      { type: 'worker_start_repair' },
      { type: 'worker_complete_job' },
    ])
    expect(completed.deal?.status).toBe('completed_by_worker')
    expect(selectLocalWorkflow(completed).canCustomerConfirmCompletion).toBe(false)

    const confirmed = localWorkflowReducer(completed, { type: 'customer_confirm_completion' })
    const selectors = selectLocalWorkflow(confirmed)
    expect(confirmed.deal?.status).toBe('confirmed_by_customer')
    expect(selectors.paymentLocked).toBe(true)
    expect(selectors.reviewLocked).toBe(true)
    expect(selectors.canCustomerSubmitReview).toBe(false)

    const reviewed = localWorkflowReducer(confirmed, { type: 'customer_submit_review' })
    expect(reviewed.deal?.status).toBe('confirmed_by_customer')
    expect(selectLocalWorkflow(reviewed).reviewLocked).toBe(true)
  })

  it('opens review only after paid and transitions the paid state cleanly', () => {
    const confirmed = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
      { type: 'worker_start_inspection' },
      { type: 'worker_start_repair' },
      { type: 'worker_complete_job' },
      { type: 'customer_confirm_completion' },
    ])
    expect(selectLocalWorkflow(confirmed).canCustomerSubmitReview).toBe(false)
    expect(localWorkflowReducer(confirmed, { type: 'customer_submit_review' }).deal?.status).toBe(
      'confirmed_by_customer',
    )

    const paid = confirmed.deal
      ? {
          ...confirmed,
          deal: { ...confirmed.deal, status: 'paid' as const, backendStatus: 'paid' as const },
        }
      : confirmed
    expect(selectLocalWorkflow(paid).canCustomerSubmitReview).toBe(true)
    expect(localWorkflowReducer(paid, { type: 'customer_submit_review' }).deal?.status).toBe('reviewed')
  })

  it('blocks worker status progression when the local audit gate is closed', () => {
    const accepted = reduce([...validBookingActions, { type: 'confirm_customer_search' }, { type: 'worker_accept_broadcast' }])
    const gatedOff = localWorkflowReducer({ ...accepted, workerGate: 'backend_pending' }, { type: 'worker_start_travel' })

    expect(gatedOff.deal?.status).toBe('worker_matched')
    expect(gatedOff.lastError).toContain('workflow')
    expect(selectLocalWorkflow(gatedOff).canWorkerAdvance).toBe(false)
  })

  it('blocks worker status progression unless the broadcast was accepted', () => {
    const accepted = reduce([...validBookingActions, { type: 'confirm_customer_search' }, { type: 'worker_accept_broadcast' }])
    const inconsistent = {
      ...accepted,
      deal: accepted.deal
        ? {
            ...accepted.deal,
            broadcast: accepted.deal.broadcast
              ? {
                  ...accepted.deal.broadcast,
                  status: 'sent' as const,
                  fullAddressVisible: false,
                  fullAddressLabel: null,
                }
              : null,
          }
        : null,
    }
    const attempted = localWorkflowReducer(inconsistent, { type: 'worker_start_travel' })

    expect(selectLocalWorkflow(inconsistent).canWorkerAdvance).toBe(false)
    expect(attempted.deal?.status).toBe('worker_matched')
    expect(attempted.lastError).toContain('đã được nhận')
  })

  it('blocks customer completion confirmation unless an accepted worker broadcast exists', () => {
    const completed = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
      { type: 'worker_start_inspection' },
      { type: 'worker_start_repair' },
      { type: 'worker_complete_job' },
    ])
    const inconsistent = {
      ...completed,
      deal: completed.deal
        ? {
            ...completed.deal,
            broadcast: completed.deal.broadcast
              ? {
                  ...completed.deal.broadcast,
                  status: 'sent' as const,
                  fullAddressVisible: false,
                  fullAddressLabel: null,
                }
              : null,
          }
        : null,
    }
    const attempted = localWorkflowReducer(inconsistent, { type: 'customer_confirm_completion' })

    expect(selectLocalWorkflow(inconsistent).canCustomerConfirmCompletion).toBe(false)
    expect(attempted.deal?.status).toBe('completed_by_worker')
    expect(attempted.lastError).toContain('thợ')
  })

  it('hydrates active scope-change details from the remote job snapshot', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: {
        id: 'job-1',
        status: 'scope_change_pending',
        serviceType: 'electrical',
        description: 'Breaker keeps tripping',
        problemChips: ['Breaker trip'],
        addressLabel: 'Block A, Quận 7',
        districtLabel: 'Quận 7',
        mediaCount: 0,
        estimate: null,
        broadcast: null,
        scopeChange: {
          id: 'scope-1',
          status: 'waiting_customer_decision',
          requestedDescription: 'Replace damaged breaker',
          reason: 'Breaker is burnt',
          priceMin: 250000,
          priceMax: 250000,
          kaelReview: null,
          kaelProgress: null,
          evidencePhotoUrls: [],
          createdAt: '2026-05-17T00:00:00.000Z',
        },
        finalPrice: null,
      },
    })

    expect(state.deal?.status).toBe('scope_change_pending')
    expect(state.deal?.scopeChange?.id).toBe('scope-1')
    expect(state.deal?.scopeChange?.priceMin).toBe(250000)
    expect(selectLocalWorkflow(state).canWorkerAdvance).toBe(false)
  })

  it('marks a stale remote worker broadcast as expired when backend no longer returns it', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_broadcast',
      broadcast: {
        broadcastId: 'broadcast-1',
        jobId: 'job-1',
        status: 'sent',
        serviceType: 'plumbing',
        problemSummary: 'Pipe leak',
        generalArea: 'Quận 7',
        secondsRemaining: 25,
        estimatedPriceLabel: '150.000đ - 350.000đ',
        estimatedEarningLabel: '135.000đ - 315.000đ',
      },
    })
    const expired = localWorkflowReducer(state, { type: 'mark_remote_broadcast_expired' })
    const selectors = selectLocalWorkflow(expired)

    expect(expired.deal?.status).toBe('broadcasting')
    expect(expired.deal?.broadcast?.status).toBe('expired')
    expect(expired.deal?.broadcast?.secondsRemaining).toBe(0)
    expect(expired.workerGate).toBe('backend_pending')
    expect(selectors.canWorkerAccept).toBe(false)
  })

  it('hydrates a fully validated remote job snapshot with nested money and worker data', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: {
        id: 'job-paid',
        status: 'paid',
        backendStatus: 'paid',
        serviceType: 'plumbing',
        description: 'Ống nước rò rỉ đã được sửa.',
        problemChips: ['Rò rỉ'],
        addressLabel: 'Quận 7',
        districtLabel: 'Quận 7',
        estimate: {
          problemLabel: 'Rò rỉ ống nước',
          complexity: 'small',
          priceRangeLabel: '200.000đ – 300.000đ',
          confidenceLabel: 'Cao',
          advisory: 'Kiểm tra thực tế trước khi làm.',
          disclaimer: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
          hasVndPrice: true,
        },
        broadcast: {
          status: 'accepted',
          serviceType: 'plumbing',
          problemSummary: 'Rò rỉ ống nước',
          generalArea: 'Quận 7',
          prebrief: ['Kiểm tra điểm rò'],
          fullAddressVisible: false,
          fullAddressLabel: null,
          secondsRemaining: null,
          estimatedEarning: 225_000,
        },
        finalPrice: 250_000,
        payment: {
          provider: 'sepay_vietqr',
          status: 'received',
          grossAmount: 250_000,
          platformFee: 25_000,
          workerNet: 225_000,
        },
        workerProfile: {
          avatarUrl: null,
          fullName: 'Nguyễn Văn A',
          id: 'worker-1',
          rating: 4.8,
          totalJobs: 12,
        },
      },
    })

    expect(state.deal?.finalPrice).toBe(250_000)
    expect(state.deal?.broadcast?.estimatedEarning).toBe(225_000)
    expect(state.deal?.payment?.status).toBe('received')
    expect(state.deal?.workerProfile?.rating).toBe(4.8)
  })

  it('hydrates a server-owned manual QR receipt without losing its payment rail', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: {
        id: 'job-manual-qr',
        status: 'payment_pending',
        backendStatus: 'payment_pending',
        serviceType: 'plumbing',
        description: 'The plumbing repair has been completed.',
        problemChips: ['Leak repaired'],
        addressLabel: 'District 7',
        districtLabel: 'District 7',
        finalPrice: 250_000,
        paymentRailAvailable: true,
        paymentRailProvider: 'platform_bank_manual',
        payment: {
          provider: 'platform_bank_manual',
          status: 'manual_qr_ready',
          grossAmount: 250_000,
          platformFee: 37_500,
          workerNet: 212_500,
          paymentCode: 'NS-MANUAL-250',
          transferContent: 'NS-MANUAL-250',
          qrImageUrl: 'https://qr.example.test/NS-MANUAL-250',
          bankCode: 'VCB',
          accountHolder: 'Platform account',
          accountMasked: '****6789',
        },
      },
    })

    expect(state.lastError).toBeNull()
    expect(state.deal?.payment?.status).toBe('manual_qr_ready')
    expect(state.deal?.paymentRailProvider).toBe('platform_bank_manual')
  })

  it('hydrates a paid cash settlement so Customer can reach review after Worker confirmation', () => {
    const state = localWorkflowReducer(createInitialLocalWorkflowState(), {
      type: 'hydrate_remote_job',
      job: {
        id: 'job-cash-paid',
        status: 'paid',
        backendStatus: 'paid',
        serviceType: 'plumbing',
        description: 'Ống nước rò rỉ đã được sửa.',
        problemChips: ['Rò rỉ'],
        addressLabel: 'Quận 3',
        districtLabel: 'Quận 3',
        finalPrice: 800_000,
        payment: {
          provider: 'cash',
          status: 'cash_confirmed',
          grossAmount: 800_000,
          platformFee: 120_000,
          workerNet: 680_000,
        },
      },
    })

    expect(state.deal?.status).toBe('paid')
    expect(state.deal?.payment?.status).toBe('cash_confirmed')
    expect(selectLocalWorkflow(state).reviewLocked).toBe(false)
  })

  it('rejects malformed remote snapshots without crashing or replacing valid local state', () => {
    const initial = createInitialLocalWorkflowState()
    const malformedBroadcast = {
      type: 'hydrate_remote_broadcast',
      broadcast: {
        broadcastId: 'broadcast-1',
        jobId: 'job-1',
        status: 'sent',
        serviceType: 'electrical',
        problemSummary: 'Breaker keeps tripping.',
        generalArea: 'Quận 7',
        prebrief: [null, 42],
        secondsRemaining: Number.NaN,
      },
    } as unknown as LocalWorkflowAction

    expect(() => localWorkflowReducer(initial, malformedBroadcast)).not.toThrow()
    const afterBroadcast = localWorkflowReducer(initial, malformedBroadcast)
    expect(afterBroadcast.deal).toBeNull()
    expect(afterBroadcast.lastError).toContain('backend')

    const malformedJob = {
      type: 'hydrate_remote_job',
      job: {
        id: 'job-1',
        status: 'paid',
        serviceType: 'electrical',
        description: 'Breaker keeps tripping.',
        problemChips: null,
        addressLabel: 'Quận 7',
        districtLabel: 'Quận 7',
      },
    } as unknown as LocalWorkflowAction
    expect(() => localWorkflowReducer(initial, malformedJob)).not.toThrow()
    expect(localWorkflowReducer(initial, malformedJob).deal).toBeNull()

    for (const invalidPatch of [
      { backendStatus: 'repairing', finalPrice: 100_000 },
      { backendStatus: 'paid', finalPrice: 0 },
      { backendStatus: 'paid', finalPrice: -1 },
      { backendStatus: 'paid', finalPrice: Number.MAX_SAFE_INTEGER + 1 },
      {
        backendStatus: 'paid',
        broadcast: {
          status: 'accepted',
          serviceType: 'electrical',
          problemSummary: 'Breaker keeps tripping.',
          generalArea: 'Quận 7',
          prebrief: [],
          fullAddressVisible: false,
          fullAddressLabel: null,
          secondsRemaining: null,
          estimatedEarning: Number.NaN,
        },
      },
      {
        backendStatus: 'paid',
        payment: { provider: null, status: 'received', grossAmount: Number.NaN, platformFee: null, workerNet: null },
      },
      {
        backendStatus: 'paid',
        workerProfile: { avatarUrl: null, id: 'worker-1', fullName: 'Worker', rating: 9, totalJobs: 1 },
      },
      {
        backendStatus: 'paid',
        scopeChange: {
          id: 'scope-1',
          status: 'approved_by_customer',
          requestedDescription: null,
          reason: null,
          priceMin: null,
          priceMax: null,
          kaelReview: null,
          kaelProgress: null,
          evidencePhotoUrls: [42],
          createdAt: null,
        },
      },
    ]) {
      const invalidNestedJob = {
        type: 'hydrate_remote_job',
        job: {
          id: 'job-1',
          status: 'paid',
          serviceType: 'electrical',
          description: 'Breaker keeps tripping.',
          problemChips: ['Breaker'],
          addressLabel: 'Quận 7',
          districtLabel: 'Quận 7',
          ...invalidPatch,
        },
      } as unknown as LocalWorkflowAction

      expect(localWorkflowReducer(initial, invalidNestedJob).deal).toBeNull()
    }
  })

  it('fails closed for malformed runtime status labels and status conversions', () => {
    expect(() => toLocalDealStatus('not-a-status' as never)).toThrow(/unknown job status/i)
    expect(isLocalDealStatus(null as never)).toBe(false)
    expect(statusLabel('not-a-status' as never)).toBe('Trạng thái không hợp lệ')
  })

  it('fails a malformed non-finite broadcast countdown closed', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const malformed = broadcasting.deal?.broadcast
      ? {
          ...broadcasting,
          deal: {
            ...broadcasting.deal,
            broadcast: { ...broadcasting.deal.broadcast, secondsRemaining: Number.NaN },
          },
        }
      : broadcasting
    const ticked = localWorkflowReducer(malformed, { type: 'tick_broadcast' })

    expect(ticked.deal?.broadcast?.status).toBe('expired')
    expect(ticked.deal?.broadcast?.secondsRemaining).toBe(0)
  })

  it('does not let worker actions advance after worker completion or customer confirmation', () => {
    const completed = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
      { type: 'worker_start_inspection' },
      { type: 'worker_start_repair' },
      { type: 'worker_complete_job' },
    ])
    const attemptedAfterCompletion = localWorkflowReducer(completed, { type: 'worker_start_repair' })
    expect(attemptedAfterCompletion.deal?.status).toBe('completed_by_worker')
    expect(attemptedAfterCompletion.lastError).toContain('workflow')

    const confirmed = localWorkflowReducer(completed, { type: 'customer_confirm_completion' })
    const attemptedAfterConfirm = localWorkflowReducer(confirmed, { type: 'worker_start_travel' })
    const selectors = selectLocalWorkflow(attemptedAfterConfirm)

    expect(attemptedAfterConfirm.deal?.status).toBe('confirmed_by_customer')
    expect(selectors.paymentLocked).toBe(true)
    expect(selectors.reviewLocked).toBe(true)
  })

  it('keeps a worker decline as local no-worker UI without fake worker match', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const declined = localWorkflowReducer(broadcasting, { type: 'worker_decline_broadcast' })
    const selectors = selectLocalWorkflow(declined)

    expect(declined.deal?.status).toBe('broadcasting')
    expect(declined.deal?.broadcast?.status).toBe('declined')
    expect(selectors.customerSearchState).toBe('no_worker')
    expect(selectors.canWorkerAccept).toBe(false)
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
  })

  it('allows customer retry after local no-worker outcome without creating a fake match', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const declined = localWorkflowReducer(broadcasting, { type: 'worker_decline_broadcast' })
    const retried = localWorkflowReducer(declined, { type: 'retry_customer_search' })
    const selectors = selectLocalWorkflow(retried)

    expect(retried.deal?.status).toBe('broadcasting')
    expect(retried.deal?.broadcast?.status).toBe('sent')
    expect(retried.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(retried.deal?.broadcast?.fullAddressLabel).toBeNull()
    expect(selectors.customerSearchState).toBe('searching')
    expect(selectors.canWorkerAccept).toBe(true)
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
  })

  it('reopens a declined local broadcast as an explicit editable draft', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const declined = localWorkflowReducer(broadcasting, { type: 'worker_decline_broadcast' })
    const reopened = localWorkflowReducer(declined, { type: 'reopen_booking_draft' })
    const selectors = selectLocalWorkflow(reopened)

    expect(reopened.deal?.status).toBe('draft')
    expect(reopened.deal?.broadcast).toBeNull()
    expect(reopened.deal?.estimate).toBeNull()
    expect(reopened.deal?.draft.description).toContain('lavabo')
    expect(reopened.workerGate).toBe('backend_pending')
    expect(selectors.customerSearchState).toBe('idle')
  })

  it('reopens a backend-cancelled no-worker broadcast as an editable draft', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const declined = localWorkflowReducer(broadcasting, { type: 'worker_decline_broadcast' })
    const cancelled = localWorkflowReducer({
      ...declined,
      deal: declined.deal
        ? {
            ...declined.deal,
            status: 'cancelled',
            broadcast: declined.deal.broadcast
              ? { ...declined.deal.broadcast, status: 'cancelled' }
              : null,
          }
        : null,
    }, { type: 'reopen_booking_draft' })

    expect(cancelled.deal?.status).toBe('draft')
    expect(cancelled.deal?.draft.description).toBe(broadcasting.deal?.draft.description)
    expect(cancelled.deal?.broadcast).toBeNull()
    expect(cancelled.workerGate).toBe('backend_pending')
    expect(cancelled.lastError).toBeNull()
  })

  it('does not reopen a still-searching broadcast as a hidden cancellation', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const attempted = localWorkflowReducer(broadcasting, { type: 'reopen_booking_draft' })

    expect(attempted.deal?.status).toBe('broadcasting')
    expect(attempted.deal?.broadcast?.status).toBe('sent')
    expect(attempted.lastError).toContain('Chỉ chỉnh yêu cầu')
  })

  it('does not let a home service card overwrite an active local deal', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const attempted = localWorkflowReducer(broadcasting, { type: 'start_home_service', serviceType: 'electrical' })

    expect(attempted.deal?.status).toBe('broadcasting')
    expect(attempted.deal?.draft.serviceType).toBe('plumbing')
    expect(attempted.deal?.broadcast?.status).toBe('sent')
    expect(attempted.lastError).toContain('Đang có yêu cầu đang chạy')
  })

  it('does not let Kael overwrite an active local deal', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const attempted = localWorkflowReducer(broadcasting, {
      type: 'submit_kael_draft',
      text: 'Ổ cắm phòng khách bị nóng, cần kiểm tra điện.',
    })

    expect(attempted.deal?.status).toBe('broadcasting')
    expect(attempted.deal?.draft.serviceType).toBe('plumbing')
    expect(attempted.deal?.broadcast?.status).toBe('sent')
    expect(attempted.lastError).toContain('Kael')
  })

  it('does not let booking edits silently reset an active broadcast', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const attempted = localWorkflowReducer(broadcasting, {
      type: 'update_booking_draft',
      patch: {
        serviceType: 'electrical',
        problemChips: [PROBLEM_CHIPS.electrical[2]],
      },
    })

    expect(attempted.deal?.status).toBe('broadcasting')
    expect(attempted.deal?.draft.serviceType).toBe('plumbing')
    expect(attempted.deal?.broadcast?.status).toBe('sent')
    expect(attempted.lastError).toContain('workflow đang chạy')
  })

  it('marks a customer-cancelled broadcast as cancelled before worker accept', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const cancelled = localWorkflowReducer(broadcasting, { type: 'cancel_deal' })
    const selectors = selectLocalWorkflow(cancelled)

    expect(cancelled.deal?.status).toBe('cancelled')
    expect(cancelled.deal?.broadcast?.status).toBe('cancelled')
    expect(cancelled.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(cancelled.deal?.broadcast?.fullAddressLabel).toBeNull()
    expect(cancelled.workerGate).toBe('backend_pending')
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
    expect(selectors.canWorkerAccept).toBe(false)
    expect(selectors.canWorkerAdvance).toBe(false)
    expect(selectors.canCustomerCancelDeal).toBe(false)
  })

  it('cancels a local workflow after worker accepts while revoking worker address access', () => {
    const accepted = reduce([...validBookingActions, { type: 'confirm_customer_search' }, { type: 'worker_accept_broadcast' }])
    const attempted = localWorkflowReducer(accepted, { type: 'cancel_deal' })
    const selectors = selectLocalWorkflow(attempted)

    expect(attempted.deal?.status).toBe('cancelled')
    expect(attempted.deal?.broadcast?.status).toBe('cancelled')
    expect(attempted.lastError).toBeNull()
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
    expect(selectors.canCustomerCancelDeal).toBe(false)
  })

  it('cancels an unbroadcast draft without fabricating a worker-visible broadcast', () => {
    const draft = reduce([{ type: 'start_home_service', serviceType: 'electrical' }])
    const cancelled = localWorkflowReducer(draft, { type: 'cancel_deal' })
    const selectors = selectLocalWorkflow(cancelled)

    expect(cancelled.deal?.status).toBe('cancelled')
    expect(cancelled.deal?.broadcast).toBeNull()
    expect(cancelled.workerGate).toBe('backend_pending')
    expect(selectors.hasLocalBroadcast).toBe(false)
    expect(selectors.canCustomerCancelDeal).toBe(false)
  })

  it('cancels active local work before completion and blocks cancellation after customer confirmation', () => {
    const arrived = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
    ])
    const attemptedAfterArrival = localWorkflowReducer(arrived, { type: 'cancel_deal' })

    expect(attemptedAfterArrival.deal?.status).toBe('cancelled')
    expect(attemptedAfterArrival.lastError).toBeNull()
    expect(selectLocalWorkflow(attemptedAfterArrival).canCustomerCancelDeal).toBe(false)

    const completed = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
      { type: 'worker_start_inspection' },
      { type: 'worker_start_repair' },
      { type: 'worker_complete_job' },
      { type: 'customer_confirm_completion' },
    ])
    const attemptedAfterConfirm = localWorkflowReducer(completed, { type: 'cancel_deal' })

    expect(attemptedAfterConfirm.deal?.status).toBe('confirmed_by_customer')
    expect(attemptedAfterConfirm.lastError).toContain('Không thể hủy')
  })

  it('blocks a clean new home service draft until the confirmed workflow is closed', () => {
    const completed = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
      { type: 'worker_start_inspection' },
      { type: 'worker_start_repair' },
      { type: 'worker_complete_job' },
      { type: 'customer_confirm_completion' },
    ])
    const next = localWorkflowReducer(completed, { type: 'start_home_service', serviceType: 'electrical' })

    expect(next.deal?.status).toBe('confirmed_by_customer')
    expect(next.lastError).toContain('yêu cầu')
    expect(next.workerGate).toBe('backend_pending')
  })

  it('allows a clean booking edit draft after a cancelled workflow', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const cancelled = localWorkflowReducer(broadcasting, { type: 'cancel_deal' })
    const next = localWorkflowReducer(cancelled, {
      type: 'update_booking_draft',
      patch: {
        serviceType: 'electrical',
        problemChips: [PROBLEM_CHIPS.electrical[2]],
        description: 'Ổ cắm phòng khách bị lỏng và phát nhiệt nhẹ khi dùng thiết bị.',
        addressLabel: 'Quận 3, TP.HCM',
      },
    })

    expect(next.deal?.status).toBe('draft')
    expect(next.deal?.draft.source).toBe('booking')
    expect(next.deal?.draft.serviceType).toBe('electrical')
    expect(next.deal?.broadcast).toBeNull()
    expect(selectLocalWorkflow(next).draftValidationMessage).toBeNull()
  })

  it('rejects blank problem chips and malformed media counts in booking drafts', () => {
    const draft = inferLocalDealDraftFromKael('The bathroom pipe is leaking and needs repair today')
    const otherwiseValid = {
      ...draft,
      addressLabel: 'District 7, HCMC',
    }

    expect(validateLocalDealDraft({ ...otherwiseValid, problemChips: ['   '] })).not.toBeNull()
    expect(validateLocalDealDraft({ ...otherwiseValid, mediaCount: Number.NaN })).not.toBeNull()
    expect(validateLocalDealDraft({ ...otherwiseValid, mediaCount: -1 })).not.toBeNull()
  })
})
