// Hand-written job states for the customer phases after the request is sent to workers. The chat
// fixtures come from the real Edge code; these only exist so the phase surfaces can be looked at, so
// money, names and timestamps are invented and nothing here is a contract fixture.

export const WORKER_ID = 'c5860000-0000-4000-8000-000000000003'
export const CANDIDATE_ID = 'd6970000-0000-4000-8000-000000000004'

const NOW = () => new Date().toISOString()
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString()

const WORKER = {
  avatar_url: null,
  display_code: 'T-0427',
  full_name: 'Trần Văn Hùng',
  id: WORKER_ID,
  rating: 4.8,
  review_count: 126,
  total_jobs: 212,
  birth_year: 1989,
  gender: 'male',
  years_experience: 7,
}

const ACCESS = {
  access_profile: { building_access: 'unknown', parking: 'unknown' },
  check_in_required: true,
  customer_handoff_required: false,
  evidence_mode: 'geofence',
  exact_unit_released: false,
  identity_check_required: true,
  release_stage: 'area_only',
  worker_checked_in: false,
}

const baseJob = () => ({
  address_access: { ...ACCESS },
  address_building: 'S1.07 Vinhomes Grand Park',
  address_district: 'Thủ Đức',
  address_floor: null,
  address_unit: null,
  arrived_at: null,
  completed_at: null,
  completion_notes: null,
  completion_photo_urls: [],
  confirmed_at: null,
  created_at: minutesAgo(90),
  customer_evidence_photo_urls: [],
  description: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường gạch.',
  display_code: 'NS-2610-0142',
  field_evidence_photo_urls: [],
  final_price: null,
  kael_advisory: null,
  kael_complexity: 'low',
  kael_estimate_card_v3: null,
  kael_price_max: null,
  kael_price_min: null,
  kael_problem_identified: 'Khoan lắp kệ gỗ lên tường gạch',
  kael_progress: null,
  kael_worker_brief_core: null,
  kael_worker_brief_guidance: null,
  matched_at: null,
  paid_at: null,
  photo_urls: [],
  problem_chips: ['Khoan/lắp kệ'],
  reviewed_at: null,
  scheduled_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  service_type: 'handyman',
  status: 'draft',
  work_paused_ms: 0,
})

const STAGES = {
  checks: [
    { kind: 'service_capability', state: 'verified' },
    { kind: 'service_area', state: 'verified' },
    { kind: 'availability', state: 'pending' },
  ],
}

// A stand-in for the bank QR so the payment card can be laid out without a network; it does not scan.
const QR_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/>'
  + [[0, 0], [14, 0], [0, 14]].map(([x, y]) => `<path fill="#111" d="M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z M${x + 2} ${y + 2}h3v3h-3z" fill-rule="evenodd"/>`).join('')
  + `<path fill="#111" d="${Array.from({ length: 36 }, (_, i) => `M${8 + ((i * 7) % 13)} ${8 + ((i * 5) % 13)}h1v1h-1z`).join('')}"/>`
  + '</svg>',
)}`
const priced = { final_price: 380_000, gross_amount: 380_000, platform_fee: 57_000, worker_net: 323_000 }
const released = { ...ACCESS, exact_unit_released: true, release_stage: 'unit_released', worker_checked_in: true }

// Each entry: label for the index page, the job fields, and optional extras on the detail response.
export const JOB_PHASES = {
  '10-matching': {
    group: 'Tìm thợ',
    label: 'Đang tìm thợ (matching)',
    job: { status: 'broadcasting' },
    matching_state: {
      ...STAGES,
      batch: { attempt: 1, deadline_at: new Date(Date.now() + 180_000).toISOString(), recipient_count: 5, seconds_remaining: 180, strategy: 'general' },
      event_history: [{ kind: 'general_batch_sent', occurred_at: minutesAgo(1), recipient_count: 5 }],
      stage: 'general_search',
      strategy: 'general',
    },
    broadcast_state: { active_count: 5, seconds_remaining: 180 },
  },
  '11-candidate': {
    group: 'Tìm thợ',
    label: 'Có thợ đề xuất (worker_candidate_review)',
    job: { status: 'worker_candidate_pending' },
    matching_state: {
      ...STAGES,
      batch: null,
      event_history: [{ kind: 'candidate_ready', occurred_at: minutesAgo(1) }],
      stage: 'candidate_ready',
      strategy: 'general',
    },
    worker: WORKER,
  },
  '12-matched': {
    group: 'Thợ thực hiện',
    label: 'Đã ghép thợ (worker_matched)',
    job: { matched_at: minutesAgo(10), status: 'worker_matched', ...priced },
    worker: WORKER,
  },
  '13-on-way': {
    group: 'Thợ thực hiện',
    label: 'Thợ đang đến (worker_on_way)',
    job: { matched_at: minutesAgo(30), status: 'worker_on_way', ...priced },
    worker: WORKER,
  },
  '14-arrived': {
    group: 'Thợ thực hiện',
    label: 'Thợ đã đến, khách đã cho lên (arrived, unit_released)',
    job: { address_access: released, arrived_at: minutesAgo(4), matched_at: minutesAgo(40), status: 'arrived', ...priced },
    worker: WORKER,
  },
  '15-inspecting': {
    group: 'Thợ thực hiện',
    label: 'Kiểm tra hiện trạng (inspecting)',
    job: { address_access: released, arrived_at: minutesAgo(12), matched_at: minutesAgo(50), status: 'inspecting', ...priced },
    worker: WORKER,
  },
  '16-repairing': {
    group: 'Thợ thực hiện',
    label: 'Đang thi công (repairing)',
    job: {
      address_access: released, arrived_at: minutesAgo(30), matched_at: minutesAgo(70), status: 'repairing',
      work_started_at: minutesAgo(18), worker_work_note: 'Đã định vị và khoan lỗ, đang bắt ke.', ...priced,
    },
    worker: WORKER,
  },
  '17-scope-change': {
    group: 'Phát sinh',
    label: 'Đề xuất đổi phạm vi (scope_change_pending)',
    job: {
      address_access: released, arrived_at: minutesAgo(40), matched_at: minutesAgo(80), status: 'scope_change_pending',
      work_started_at: minutesAgo(25), ...priced,
    },
    worker: WORKER,
    current_scope_change: {
      created_at: minutesAgo(3),
      evidence_photo_urls: [],
      id: 'e7a80000-0000-4000-8000-000000000005',
      kael_computed_max: 258_000,
      kael_computed_min: 258_000,
      kael_progress: null,
      // The customer can only decide once Kael's review carries a verified baseline, a price inside it
      // and both confirmations, so this carries all of them.
      kael_review: {
        baseline_evidence: {
          accepted_source_count: 2,
          aggregate_price_max: 375_000,
          aggregate_price_min: 140_000,
          high_trust_source_count: 2,
          quorum_met: true,
          required_quorum: 2,
          schema_version: 'baseline_price_evidence_receipt.v1',
          sources: [
            { domain: 'suachuatainha.com.vn', effective_tier: 1, observed_at: '2026-08-14', price_max: 250_000, price_min: 120_000, unit: 'per_cabinet_door', url: 'https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/', weight: 1 },
            { domain: 'nhabepsaigon.vn', effective_tier: 1, observed_at: '2026-08-14', price_max: 500_000, price_min: 160_000, unit: 'per_cabinet_door', url: 'https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat', weight: 1 },
          ],
          unit: 'per_cabinet_door',
        },
        baseline_source: 'multi_source_hcmc_cabinet_door_2026_08',
        baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
        confidence: 0.9,
        confirmed_facts: ['Tường có đường ống âm', 'Cần đổi vị trí khoan', 'Lối tiếp cận bình thường'],
        price_source: 'verified_baseline',
        pricing_mode: 'full_scope_total',
        reference_price_max: 375_000,
        reference_price_min: 140_000,
        selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
        stakeholder_balance: {
          commission_level: 1,
          commission_rate_bps: 1500,
          customer_confirmation_required: true,
          customer_total: 258_000,
          platform_fee: 38_700,
          worker_confirmation_required: true,
          worker_net: 219_300,
        },
        unknowns: [],
        worker_price_confirmation: { confirmed: true, confirmed_at: minutesAgo(2), quote_id: 'a7500000-0000-4000-8000-000000000010' },
      },
      price_max: 258_000,
      price_min: 258_000,
      reason: 'Tường có đường ống âm, phải đổi vị trí khoan và dùng thêm tắc kê nở.',
      request_timing: 'on_site',
      requested_description: 'Đổi vị trí khoan, thêm vật tư tắc kê nở và công dời vị trí.',
      resume_job_status: 'repairing',
      status: 'waiting_customer_decision',
    },
  },
  '18-completed': {
    group: 'Hoàn tất',
    label: 'Thợ báo xong, chờ khách xác nhận (completed_by_worker)',
    job: {
      address_access: released, arrived_at: minutesAgo(60), completed_at: minutesAgo(2),
      completion_notes: 'Đã lắp xong kệ, thử tải 3kg chắc chắn.', matched_at: minutesAgo(100), status: 'completed_by_worker', ...priced,
    },
    worker: WORKER,
  },
  '19-payment': {
    group: 'Hoàn tất',
    label: 'Chờ thanh toán (payment_pending)',
    job: {
      address_access: released, arrived_at: minutesAgo(70), completed_at: minutesAgo(12), confirmed_at: minutesAgo(5),
      matched_at: minutesAgo(110), payment_code: 'NS0142', payment_expires_at: new Date(Date.now() + 900_000).toISOString(),
      payment_provider: 'platform_bank_manual', payment_rail_available: true, payment_rail_provider: 'platform_bank_manual',
      payment_status: 'pending', payment_transfer_content: 'NS0142 THANHTOAN', status: 'payment_pending', ...priced,
    },
    worker: WORKER,
  },
  '20-paid': {
    group: 'Hoàn tất',
    label: 'Đã thanh toán, mời đánh giá (paid)',
    job: {
      address_access: released, arrived_at: minutesAgo(80), completed_at: minutesAgo(22), confirmed_at: minutesAgo(15),
      matched_at: minutesAgo(120), paid_at: minutesAgo(2), payment_amount_received: 380_000, payment_provider: 'platform_bank_manual',
      payment_received_at: minutesAgo(2), payment_status: 'manual_verified', status: 'paid', ...priced,
    },
    worker: WORKER,
  },
  '21-done': {
    group: 'Hoàn tất',
    label: 'Đã đánh giá (done)',
    job: {
      address_access: released, arrived_at: minutesAgo(90), completed_at: minutesAgo(32), confirmed_at: minutesAgo(25),
      matched_at: minutesAgo(130), paid_at: minutesAgo(12), payment_amount_received: 380_000, payment_provider: 'platform_bank_manual',
      payment_received_at: minutesAgo(12), payment_status: 'manual_verified', reviewed_at: minutesAgo(1), status: 'reviewed', ...priced,
    },
    worker: WORKER,
  },
  '22-matching-saved': {
    group: 'Tìm thợ',
    label: 'Đang tìm thợ, ưu tiên thợ đã lưu (saved_worker_search)',
    job: { status: 'broadcasting' },
    matching_state: {
      ...STAGES,
      batch: { attempt: 1, deadline_at: new Date(Date.now() + 240_000).toISOString(), recipient_count: 1, seconds_remaining: 240, strategy: 'saved_worker' },
      event_history: [{ kind: 'saved_worker_requested', occurred_at: minutesAgo(1), recipient_count: 1 }],
      stage: 'saved_worker_search',
      strategy: 'saved_worker_first',
    },
    broadcast_state: { active_count: 1, seconds_remaining: 240 },
  },
  '23-payment-qr': {
    group: 'Hoàn tất',
    label: 'Thanh toán có mã QR sẵn sàng (payment_pending, manual_qr_ready)',
    job: {
      address_access: released, arrived_at: minutesAgo(70), completed_at: minutesAgo(12), confirmed_at: minutesAgo(5),
      matched_at: minutesAgo(110), payment_code: 'NS0142', payment_expires_at: new Date(Date.now() + 900_000).toISOString(),
      payment_provider: 'platform_bank_manual', payment_qr_image_url: QR_PLACEHOLDER, payment_rail_available: true,
      payment_rail_provider: 'platform_bank_manual', payment_status: 'manual_qr_ready',
      payment_transfer_content: 'NS0142 THANHTOAN', status: 'payment_pending',
      payment_receipt: { account_holder: 'CONG TY NESTSCOUT', account_masked: '•••• 4821', bank_code: 'VCB', status: 'manual_qr_ready' },
      ...priced,
    },
    worker: WORKER,
  },
  '24-arrived-checkin': {
    group: 'Thợ thực hiện',
    label: 'Thợ đã đến, chờ thợ check-in ảnh sảnh (arrived, area_only)',
    job: { arrived_at: minutesAgo(1), matched_at: minutesAgo(40), status: 'arrived', ...priced },
    worker: WORKER,
  },
  '25-arrived-confirm': {
    group: 'Thợ thực hiện',
    label: 'Thợ đã check-in, chờ khách cho lên (arrived, building_released)',
    job: {
      address_access: {
        ...ACCESS,
        authorization_context: { expected_check_in_at: minutesAgo(2), expected_worker_id: WORKER_ID },
        authorization_receipt: null,
        check_in_photo_refs: ['supabase://job-media/b4750000-0000-4000-8000-000000000115/access_check_in/lobby-1.jpg'],
        release_stage: 'building_released',
        worker_checked_in: true,
      },
      arrived_at: minutesAgo(5), matched_at: minutesAgo(45), status: 'arrived', ...priced,
    },
    worker: WORKER,
  },
  '26-estimate-offer': {
    group: 'Chưa xem lần nào',
    label: 'Báo giá ước tính thông thường, khách duyệt (awaiting_customer_confirm)',
    job: {
      kael_advisory: 'Giá tham khảo đã đối chiếu thị trường; Kael cập nhật khi có bằng chứng phạm vi mới.',
      kael_complexity: 'low', kael_price_max: 450_000, kael_price_min: 350_000, status: 'awaiting_customer_confirm',
    },
  },
  '28-scope-reviewing': {
    group: 'Chưa xem lần nào',
    label: 'Kael đang xem xét sự cố, chưa đề xuất (inspecting + incident)',
    current_job_incident: {
      created_at: minutesAgo(8), evidence_count: 2, evidence_status: 'ready',
      id: 'f8b90000-0000-4000-8000-000000000007', last_next_actor: 'worker', last_question: null,
      last_summary: 'Kael đã đủ căn cứ để chuẩn bị đề xuất.',
      reported_description: 'Thay đúng hai bản lề kim loại bị nứt',
      reported_reason: 'Hai bản lề nứt, gỗ và cánh tủ không hư hỏng.',
      status: 'ready_for_scope_proposal', updated_at: minutesAgo(2),
    },
    job: { address_access: released, arrived_at: minutesAgo(25), matched_at: minutesAgo(60), status: 'inspecting', ...priced },
    worker: WORKER,
  },
  '29-rfq-inspecting': {
    group: 'Chưa xem lần nào',
    label: 'RFQ: thợ báo giá sau khảo sát, chưa có giá chốt (inspecting)',
    job: { address_access: released, arrived_at: minutesAgo(15), matched_at: minutesAgo(50), quote_mode: 'rfq', status: 'inspecting' },
    worker: WORKER,
  },
  '30-matching-exhausted': {
    group: 'Chưa xem lần nào',
    label: 'Tìm thợ hết lượt, chưa có ai nhận (broadcasting, exhausted)',
    job: { status: 'broadcasting' },
    matching_state: {
      ...STAGES,
      batch: null,
      event_history: [
        { kind: 'general_batch_sent', occurred_at: minutesAgo(9), recipient_count: 5 },
        { kind: 'no_worker_found', occurred_at: minutesAgo(1) },
      ],
      stage: 'exhausted',
      strategy: 'general',
    },
    broadcast_state: { active_count: 0, seconds_remaining: 0 },
  },
  '31-cancelled-refund': {
    group: 'Chưa xem lần nào',
    label: 'Việc bị huỷ, có khoản cần hoàn tiền (cancelled + refund)',
    job: {
      address_access: released, matched_at: minutesAgo(120), paid_at: minutesAgo(30), payment_amount_received: 380_000,
      payment_provider: 'platform_bank_manual', payment_received_at: minutesAgo(30), payment_status: 'manual_verified',
      payment_receipt: {
        refund: {
          amount_vnd: 380_000, obligation_ids: ['f8b90000-0000-4000-8000-000000000008'],
          receipt_verification_available: false, requested_at: minutesAgo(20), state: 'refund_required',
        },
        status: 'manual_verified',
      },
      status: 'cancelled', ...priced,
    },
    worker: WORKER,
  },
  '32-completed-issue': {
    group: 'Chưa xem lần nào',
    label: 'Thợ báo xong: bấm "Có vấn đề" hoặc "Báo cáo thợ" (completed_by_worker)',
    job: {
      address_access: released, arrived_at: minutesAgo(60), completed_at: minutesAgo(2),
      completion_notes: 'Đã lắp xong kệ, thử tải 3kg chắc chắn.', matched_at: minutesAgo(100), status: 'completed_by_worker', ...priced,
    },
    worker: WORKER,
  },
  '33-direct-worker-payment': {
    group: 'Chưa xem lần nào',
    label: 'Thanh toán trực tiếp với thợ, bản ghi cũ (direct_worker)',
    job: {
      address_access: released, arrived_at: minutesAgo(70), completed_at: minutesAgo(12), confirmed_at: minutesAgo(5),
      matched_at: minutesAgo(110), payment_provider: 'direct_worker', payment_status: 'direct_awaiting_customer_confirmation',
      payment_receipt: {
        collateral_amount: 57_000, direct_payment_available: true,
        response_deadline: new Date(Date.now() + 1_800_000).toISOString(), status: 'direct_awaiting_customer_confirmation',
      },
      status: 'payment_pending', ...priced,
    },
    worker: WORKER,
  },
  '34-long-history': {
    group: 'Chưa xem lần nào',
    label: 'Đã đánh giá, lịch sử các bước dài nhất (reviewed)',
    job: {
      address_access: released, arrived_at: minutesAgo(90), completed_at: minutesAgo(30), confirmed_at: minutesAgo(25),
      matched_at: minutesAgo(130), paid_at: minutesAgo(20), payment_amount_received: 380_000, payment_provider: 'platform_bank_manual',
      payment_received_at: minutesAgo(20), payment_status: 'manual_verified', reviewed_at: minutesAgo(5), status: 'reviewed', ...priced,
    },
    worker: WORKER,
  },
}

// One id per phase, so every browser tab names its own phase in the URL and the mock keeps no global state.
export const jobIdFor = (name) => `b4750000-0000-4000-8000-${String(100 + Object.keys(JOB_PHASES).indexOf(name)).padStart(12, '0')}`
export const phaseForJobId = (id) => Object.keys(JOB_PHASES).find((name) => jobIdFor(name) === id) ?? null

// A made-up drive from near the Vinhomes Grand Park gate to the building, with the worker a bit past
// the middle. The report time is set when the job is read, so the freshness line stays recent.
const TRAVEL_ROUTE = [
  [10.8406, 106.8271], [10.8411, 106.8290], [10.8423, 106.8304], [10.8431, 106.8325], [10.8429, 106.8349],
  [10.8438, 106.8368], [10.8452, 106.8379], [10.8467, 106.8385], [10.8481, 106.8398], [10.8490, 106.8421],
].map(([lat, lng]) => [10.8406 + (lat - 10.8406) * 2.3, 106.8271 + (lng - 106.8271) * 3.4])
const TRAVEL_WORKER_AT = 3
function travelFor(name) {
  if (name !== '13-on-way') return null
  const metres = (a, b) => Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * Math.cos(a[0] * Math.PI / 180))
  const legs = TRAVEL_ROUTE.slice(1).map((point, index) => metres(TRAVEL_ROUTE[index], point))
  const total = legs.reduce((sum, leg) => sum + leg, 0)
  const remaining = legs.slice(TRAVEL_WORKER_AT).reduce((sum, leg) => sum + leg, 0)
  return {
    position: TRAVEL_ROUTE[TRAVEL_WORKER_AT],
    remaining_meters: Math.round(remaining),
    remaining_seconds: Math.round(remaining / 5.6),
    route: TRAVEL_ROUTE,
    total_meters: Math.round(total),
    updated_at: new Date(Date.now() - 25_000).toISOString(),
  }
}

// The limits of the completion_nudge_state database function, so the preview answers like the server.
const NUDGE_MIN_WORK_MS = 10 * 60_000
const NUDGE_COOLDOWN_MS = 15 * 60_000
const NUDGE_MAX = 3
export function completionNudgeState(job, sentAt, now = Date.now()) {
  const used = sentAt.length
  const last = used > 0 ? Math.max(...sentAt) : null
  const base = { last_nudged_at: last === null ? null : new Date(last).toISOString(), max_allowed: NUDGE_MAX, next_available_at: null, used }
  if (job.status !== 'repairing') return { ...base, can_nudge: false, reason: 'INVALID_STATUS' }
  if (job.work_paused_at) return { ...base, can_nudge: false, reason: 'WORK_PAUSED' }
  if (used >= NUDGE_MAX) return { ...base, can_nudge: false, reason: 'LIMIT_REACHED' }
  const earliest = Date.parse(job.work_started_at ?? '') + (job.work_paused_ms ?? 0) + NUDGE_MIN_WORK_MS
  if (!Number.isFinite(earliest) || now < earliest) {
    return { ...base, can_nudge: false, next_available_at: Number.isFinite(earliest) ? new Date(earliest).toISOString() : null, reason: 'TOO_EARLY' }
  }
  if (last !== null && now < last + NUDGE_COOLDOWN_MS) {
    return { ...base, can_nudge: false, next_available_at: new Date(last + NUDGE_COOLDOWN_MS).toISOString(), reason: 'COOLDOWN' }
  }
  return { ...base, can_nudge: true, reason: null }
}

export function jobDetail(name) {
  const phase = JOB_PHASES[name]
  if (!phase) return null
  return {
    worker_travel: travelFor(name),
    broadcast_state: phase.broadcast_state ?? null,
    current_job_incident: phase.current_job_incident ?? null,
    current_scope_change: phase.current_scope_change ?? null,
    job: { ...baseJob(), id: jobIdFor(name), ...phase.job },
    matching_state: phase.matching_state ?? null,
    worker: phase.worker ?? null,
  }
}

export function candidateResponse(name) {
  const phase = JOB_PHASES[name]
  if (!phase || phase.job.status !== 'worker_candidate_pending') return { candidate: null, job_id: jobIdFor(name), status: phase?.job.status ?? 'draft' }
  return {
    candidate: {
      avatar_url: null,
      birth_year: 1989,
      candidate_id: CANDIDATE_ID,
      customer_decided_at: null,
      direct_payment_available: false,
      display_name: WORKER.full_name,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      gender: 'male',
      is_favorite: false,
      original_scope_price_quote: null,
      proposed_at: NOW(),
      rating: WORKER.rating,
      status: 'proposed',
      total_jobs: WORKER.total_jobs,
      verification_status: 'verified',
      worker_id: WORKER_ID,
      worker_proposal: {
        price_max: 380_000,
        price_min: 380_000,
        proposal_id: 'f8b90000-0000-4000-8000-000000000006',
        scope_summary: 'Khoan lắp kệ gỗ 30x20cm lên tường gạch, tự mang tắc kê và vít.',
        status: 'proposed',
      },
      years_experience: 7,
    },
    job_id: jobIdFor(name),
    status: 'worker_candidate_pending',
  }
}
