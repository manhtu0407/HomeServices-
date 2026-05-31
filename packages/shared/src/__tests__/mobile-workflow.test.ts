import { describe, expect, it } from 'vitest'
import { JOB_STATUSES, PROBLEM_CHIPS } from '../constants'
import {
  createInitialLocalWorkflowState,
  hasSpecificWorkerRouteAddress,
  inferLocalDealDraftFromKael,
  isLocalDealStatus,
  LOCAL_DEAL_STATUSES,
  localWorkflowReducer,
  selectLocalWorkflow,
  toLocalDealStatus,
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
      'awaiting_customer_confirm',
      'broadcasting',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
      'confirmed_by_customer',
      'reviewed',
      'cancelled',
    ])
    expect([...LOCAL_DEAL_STATUSES]).not.toContain('payment_pending')
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

    expect(toLocalDealStatus('estimate_ready')).toBe('awaiting_customer_confirm')
    expect(toLocalDealStatus('payment_pending')).toBe('confirmed_by_customer')
    expect(toLocalDealStatus('paid')).toBe('confirmed_by_customer')
  })

  it('preserves backend-only settlement status when hydrating remote jobs', () => {
    const state = reduce([{
      type: 'hydrate_remote_job',
      job: {
        id: 'job-paid',
        backendStatus: 'paid',
        status: toLocalDealStatus('paid'),
        serviceType: 'plumbing',
        description: 'Vòi nước lavabo rò liên tục.',
        problemChips: [PROBLEM_CHIPS.plumbing[0]],
        addressLabel: 'Quận 7, TP.HCM',
        districtLabel: 'Quận 7',
      },
    }])
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('confirmed_by_customer')
    expect(state.deal?.backendStatus).toBe('paid')
    expect(selectors.currentStatus).toBe('confirmed_by_customer')
    expect(selectors.currentBackendStatus).toBe('paid')
  })

  it('keeps review locked only while backend settlement is still payment_pending', () => {
    const phaseZeroConfirmed = reduce([{
      type: 'hydrate_remote_job',
      job: {
        id: 'job-confirmed',
        backendStatus: 'confirmed_by_customer',
        status: toLocalDealStatus('confirmed_by_customer'),
        serviceType: 'plumbing',
        description: 'Vòi nước lavabo rò liên tục.',
        problemChips: [PROBLEM_CHIPS.plumbing[0]],
        addressLabel: 'Quận 7, TP.HCM',
        districtLabel: 'Quận 7',
      },
    }])
    const pendingPayment = reduce([{
      type: 'hydrate_remote_job',
      job: {
        id: 'job-payment-pending',
        backendStatus: 'payment_pending',
        status: toLocalDealStatus('payment_pending'),
        serviceType: 'plumbing',
        description: 'Vòi nước lavabo rò liên tục.',
        problemChips: [PROBLEM_CHIPS.plumbing[0]],
        addressLabel: 'Quận 7, TP.HCM',
        districtLabel: 'Quận 7',
      },
    }])
    const paid = reduce([{
      type: 'hydrate_remote_job',
      job: {
        id: 'job-paid',
        backendStatus: 'paid',
        status: toLocalDealStatus('paid'),
        serviceType: 'plumbing',
        description: 'Vòi nước lavabo rò liên tục.',
        problemChips: [PROBLEM_CHIPS.plumbing[0]],
        addressLabel: 'Quận 7, TP.HCM',
        districtLabel: 'Quận 7',
      },
    }])

    expect(selectLocalWorkflow(phaseZeroConfirmed).reviewLocked).toBe(false)
    expect(selectLocalWorkflow(phaseZeroConfirmed).canCustomerSubmitReview).toBe(true)
    expect(selectLocalWorkflow(pendingPayment).reviewLocked).toBe(true)
    expect(selectLocalWorkflow(pendingPayment).canCustomerSubmitReview).toBe(false)
    expect(selectLocalWorkflow(paid).reviewLocked).toBe(false)
    expect(selectLocalWorkflow(paid).canCustomerSubmitReview).toBe(true)

    const reviewed = localWorkflowReducer(paid, { type: 'customer_submit_review' })
    expect(reviewed.deal?.status).toBe('reviewed')
    expect(reviewed.deal?.backendStatus).toBe('reviewed')
    expect(selectLocalWorkflow(reviewed).currentBackendStatus).toBe('reviewed')
  })

  it('does not optimistically submit review while backend settlement is payment_pending', () => {
    const pendingPayment = reduce([{
      type: 'hydrate_remote_job',
      job: {
        id: 'job-payment-pending',
        backendStatus: 'payment_pending',
        status: toLocalDealStatus('payment_pending'),
        serviceType: 'plumbing',
        description: 'Vòi nước lavabo rò liên tục.',
        problemChips: [PROBLEM_CHIPS.plumbing[0]],
        addressLabel: 'Quận 7, TP.HCM',
        districtLabel: 'Quận 7',
      },
    }])
    const attempted = localWorkflowReducer(pendingPayment, { type: 'customer_submit_review' })

    expect(attempted.deal?.status).toBe('confirmed_by_customer')
    expect(attempted.deal?.backendStatus).toBe('payment_pending')
    expect(attempted.lastError).toContain('hệ thống xác nhận đúng bước')
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

  it('flags unsupported Kael service requests instead of treating them as supported deals', () => {
    const draft = inferLocalDealDraftFromKael('Tôi muốn vệ sinh máy lạnh trong căn hộ')

    expect(draft.serviceType).toBeNull()
    expect(draft.needsServiceChoice).toBe(true)
    expect(draft.problemChips).toEqual([])
    expect(draft.unsupportedServiceLabel).toContain('chỉ hỗ trợ sửa điện, sửa nước và vệ sinh')
  })

  it('does not misclassify unsupported AC leak language as plumbing', () => {
    const draft = inferLocalDealDraftFromKael('Máy lạnh phòng ngủ bị rò nước và cần kiểm tra')

    expect(draft.serviceType).toBeNull()
    expect(draft.needsServiceChoice).toBe(true)
    expect(draft.problemChips).toEqual([])
    expect(draft.unsupportedServiceLabel).toContain('chỉ hỗ trợ sửa điện, sửa nước và vệ sinh')
  })

  it('clears unsupported Kael hints after the customer explicitly chooses a supported service in booking', () => {
    const unsupported = reduce([{ type: 'submit_kael_draft', text: 'Tôi muốn vệ sinh máy lạnh trong căn hộ' }])
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

  it('lets Kael move booking from analysis into worker search with remote estimate placeholder', () => {
    const state = reduce(validBookingActions)
    const selectors = selectLocalWorkflow(state)

    expect(state.deal?.status).toBe('broadcasting')
    expect(state.deal?.draft.timeChoice).toBe('now')
    expect(state.deal?.estimate?.priceRangeLabel).toBe('Chờ Kael ước tính')
    expect(state.deal?.estimate?.hasVndPrice).toBe(false)
    expect(state.deal?.estimate?.disclaimer).toContain('Kael')
    expect(selectors.scheduleMode).toBe('now_only')
    expect(state.deal?.broadcast?.status).toBe('sent')
    expect(selectors.canConfirmCustomerSearch).toBe(false)
    expect(selectors.customerSearchState).toBe('searching')
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

  it('keeps the legacy customer search command locked when Kael has no estimate', () => {
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

  it('creates a local broadcast as part of Kael autonomous analysis completion', () => {
    const state = reduce(validBookingActions)
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

  it('keeps district-only addresses as area previews after worker accept', () => {
    const districtOnly = reduce([
      { type: 'start_home_service', serviceType: 'plumbing' },
      {
        type: 'update_booking_draft',
        patch: {
          addressLabel: 'Quan 7, TP.HCM',
          description: 'Voi nuoc duoi lavabo ro lien tuc va da khoa van phu.',
          mediaCount: 1,
          problemChips: [PROBLEM_CHIPS.plumbing[0]],
        },
      },
      { type: 'submit_booking_draft' },
      { type: 'finish_local_analysis' },
      { type: 'confirm_customer_search' },
    ])
    const accepted = localWorkflowReducer(districtOnly, { type: 'worker_accept_broadcast' })
    const selectors = selectLocalWorkflow(accepted)

    expect(hasSpecificWorkerRouteAddress('Block A, Quan 7, TP.HCM', 'Quan 7')).toBe(true)
    expect(hasSpecificWorkerRouteAddress('Landmark 81, District 7, HCMC', 'District 7')).toBe(true)
    expect(hasSpecificWorkerRouteAddress('Quan 7, TP.HCM', 'Quan 7')).toBe(false)
    expect(hasSpecificWorkerRouteAddress('Phuong 7, Quan 7, TP.HCM', 'Quan 7')).toBe(false)
    expect(hasSpecificWorkerRouteAddress('District 7, HCMC', 'District 7')).toBe(false)
    expect(hasSpecificWorkerRouteAddress('Ward 7, District 7, HCMC', 'District 7')).toBe(false)
    expect(accepted.deal?.broadcast?.status).toBe('accepted')
    expect(accepted.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(accepted.deal?.broadcast?.fullAddressLabel).toBeNull()
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
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

  it('blocks illegal worker/customer jumps and keeps completion authority off the customer UI selector', () => {
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

    // Legacy reducer path remains for backend parity/recovery, but the selector
    // above prevents it from becoming the default client authority.
    const confirmed = localWorkflowReducer(completed, { type: 'customer_confirm_completion' })
    const selectors = selectLocalWorkflow(confirmed)
    expect(confirmed.deal?.status).toBe('confirmed_by_customer')
    expect(selectors.paymentLocked).toBe(true)
    expect(selectors.reviewLocked).toBe(false)
    expect(selectors.canCustomerSubmitReview).toBe(true)

    const reviewed = localWorkflowReducer(confirmed, { type: 'customer_submit_review' })
    expect(reviewed.deal?.status).toBe('reviewed')
    expect(selectLocalWorkflow(reviewed).reviewLocked).toBe(true)
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

  it('does not let worker actions advance after worker completion or Kael completion review', () => {
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
    expect(selectors.reviewLocked).toBe(false)
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

  it('expires a customer-cancelled broadcast before worker accept', () => {
    const broadcasting = reduce([...validBookingActions, { type: 'confirm_customer_search' }])
    const cancelled = localWorkflowReducer(broadcasting, { type: 'cancel_deal' })
    const selectors = selectLocalWorkflow(cancelled)

    expect(cancelled.deal?.status).toBe('cancelled')
    expect(cancelled.deal?.broadcast?.status).toBe('expired')
    expect(cancelled.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(cancelled.deal?.broadcast?.fullAddressLabel).toBeNull()
    expect(cancelled.workerGate).toBe('backend_pending')
    expect(selectors.canWorkerSeeFullAddress).toBe(false)
    expect(selectors.canWorkerAccept).toBe(false)
    expect(selectors.canWorkerAdvance).toBe(false)
    expect(selectors.canCustomerCancelDeal).toBe(false)
  })

  it('lets customer cancellation become a Kael policy input after worker accepts', () => {
    const accepted = reduce([...validBookingActions, { type: 'confirm_customer_search' }, { type: 'worker_accept_broadcast' }])
    const beforeCancel = selectLocalWorkflow(accepted)
    const cancelled = localWorkflowReducer(accepted, { type: 'cancel_deal' })
    const selectors = selectLocalWorkflow(cancelled)

    expect(beforeCancel.canCustomerCancelDeal).toBe(true)
    expect(cancelled.deal?.status).toBe('cancelled')
    expect(cancelled.deal?.broadcast?.status).toBe('expired')
    expect(cancelled.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(cancelled.deal?.broadcast?.fullAddressLabel).toBeNull()
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

  it('allows active customer cancellation before Kael completion review but blocks after confirmation', () => {
    const arrived = reduce([
      ...validBookingActions,
      { type: 'confirm_customer_search' },
      { type: 'worker_accept_broadcast' },
      { type: 'worker_start_travel' },
      { type: 'worker_mark_arrived' },
    ])
    const cancelledAfterArrival = localWorkflowReducer(arrived, { type: 'cancel_deal' })
    const cancelledSelectors = selectLocalWorkflow(cancelledAfterArrival)

    expect(selectLocalWorkflow(arrived).canCustomerCancelDeal).toBe(true)
    expect(cancelledAfterArrival.deal?.status).toBe('cancelled')
    expect(cancelledAfterArrival.deal?.broadcast?.status).toBe('expired')
    expect(cancelledAfterArrival.deal?.broadcast?.fullAddressVisible).toBe(false)
    expect(cancelledAfterArrival.deal?.broadcast?.fullAddressLabel).toBeNull()
    expect(cancelledSelectors.canWorkerSeeFullAddress).toBe(false)
    expect(cancelledSelectors.canCustomerCancelDeal).toBe(false)

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

  it('does not allow a clean new home service draft before the customer review completes', () => {
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
    expect(next.deal?.draft.serviceType).toBe('plumbing')
    expect(next.lastError).toContain('Đang có yêu cầu đang chạy')
  })

  it('allows a clean new home service draft after the customer review completes', () => {
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
      { type: 'customer_submit_review' },
    ])
    const next = localWorkflowReducer(completed, { type: 'start_home_service', serviceType: 'electrical' })

    expect(next.deal?.status).toBe('draft')
    expect(next.deal?.draft.serviceType).toBe('electrical')
    expect(next.deal?.draft.problemChips).toEqual([])
    expect(next.deal?.broadcast).toBeNull()
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
})
