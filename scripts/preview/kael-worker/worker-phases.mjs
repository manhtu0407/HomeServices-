import { MOCK_USERS } from '../cache-e2e/mock-backend.mjs'

// Worker-side Case Work phases. The app keeps ONE active deal per worker, taken from whatever
// /workers/me/jobs and /workers/me/broadcasts return, so a phase is a snapshot of those two lists.

export const WORKER_ID = MOCK_USERS['worker.a@nestscout.test'].id

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString()
const minutesAhead = (m) => new Date(Date.now() + m * 60_000).toISOString()
const uuid = (n) => `c5760000-0000-4000-8000-${String(n).padStart(12, '0')}`

const quote = (id, total, net, fee) => ({
  schema_version: 'original_scope_price_quote.v1',
  quote_id: id,
  reference_price_min: total - 40_000,
  reference_price_max: total + 40_000,
  customer_total: total,
  platform_fee: fee,
  worker_net: net,
  commission_level: 1,
  commission_rate_bps: 1500,
  price_source: 'kael_market_baseline',
  selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
  worker_confirmation_required: true,
  customer_confirmation_required: true,
  worker_confirmed_at: null,
  expires_at: minutesAhead(25),
  evidence_summary: {
    confidence: 'high',
    baseline_source_count: 3,
    market_source_count: 4,
    high_trust_source_count: 2,
    quorum_met: true,
    cap_statement: 'Giá tham chiếu từ 7 nguồn đã kiểm chứng.',
  },
})

const brief = (guidance, safety, context) => ({ sections: { guidance, safety, context } })

const broadcast = (n, extra) => ({
  broadcast_id: uuid(200 + n),
  job_id: uuid(300 + n),
  status: 'sent',
  media_count: 2,
  sent_at: minutesAgo(2),
  expires_at: minutesAhead(8),
  seconds_remaining: 480,
  scheduled_at: minutesAhead(90),
  confirmed_recipient_count: 4,
  ...extra,
})

const OFFER_ELECTRIC = broadcast(1, {
  service_type: 'electrical',
  problem_summary: 'Ổ cắm phòng khách chập chờn, có mùi khét nhẹ',
  scope_summary: 'Kiểm tra và thay ổ cắm đôi, kiểm tra dây và aptomat nhánh phòng khách.',
  district: 'Bình Thạnh',
  estimated_price_min: 320_000,
  estimated_price_max: 400_000,
  estimated_earning_min: 272_000,
  estimated_earning_max: 340_000,
  proposal_action: 'accept_priced_offer',
  quote_mode: 'kael_auto_quote',
  original_scope_price_quote: quote('d5760000-0000-4000-8000-000000000001', 360_000, 306_000, 54_000),
  worker_brief_core: brief(
    ['Ngắt aptomat nhánh trước khi tháo ổ cắm', 'Mang ổ cắm đôi 16A và đầu cos dự phòng'],
    ['Có mùi khét: kiểm tra dây chảy nhựa trước khi cấp điện lại'],
    ['Căn hộ 2PN, khách ở nhà buổi chiều'],
  ),
})

const OFFER_AC = broadcast(2, {
  service_type: 'hvac',
  problem_summary: 'Máy lạnh chảy nước dàn lạnh, làm lạnh yếu',
  scope_summary: 'Vệ sinh dàn lạnh, thông ống thoát nước, kiểm tra gas.',
  district: 'Quận 7',
  estimated_price_min: 450_000,
  estimated_price_max: 550_000,
  estimated_earning_min: 380_000,
  estimated_earning_max: 470_000,
  proposal_action: 'accept_priced_offer',
  quote_mode: 'kael_auto_quote',
  seconds_remaining: 300,
  original_scope_price_quote: quote('d5760000-0000-4000-8000-000000000002', 500_000, 425_000, 75_000),
})

const OFFER_HANDYMAN = broadcast(3, {
  service_type: 'handyman',
  problem_summary: 'Lắp giá treo tivi 55 inch lên tường gạch',
  scope_summary: 'Khoan tường, bắt vít nở, lắp giá và đi gọn dây.',
  district: 'Thủ Đức',
  estimated_price_min: 250_000,
  estimated_price_max: 320_000,
  estimated_earning_min: 212_000,
  estimated_earning_max: 272_000,
  proposal_action: 'accept_priced_offer',
  quote_mode: 'kael_auto_quote',
  seconds_remaining: 420,
  original_scope_price_quote: quote('d5760000-0000-4000-8000-000000000003', 285_000, 242_000, 43_000),
})

const closedAccess = {
  release_stage: 'area_only',
  exact_unit_released: false,
  worker_checked_in: false,
  check_in_required: true,
  identity_check_required: true,
  customer_handoff_required: false,
  evidence_mode: 'geofence',
  access_profile: {},
}

const releasedAccess = {
  ...closedAccess,
  release_stage: 'unit_released',
  exact_unit_released: true,
  worker_checked_in: true,
  access_profile: {
    entry_method: 'Báo bảo vệ tên khách, lấy thẻ thang máy ở quầy lễ tân',
    parking_note: 'Gửi xe máy hầm B1, miễn phí 30 phút',
    building_note: 'Tòa A, thang máy phía sau sảnh',
  },
}

export const PROBLEM_PHOTO_REF = `supabase://job-media/${uuid(300)}/before/problem-1.jpg`

const job = (extra) => ({
  id: uuid(300),
  display_code: 'NS-2026-0417',
  status: 'worker_candidate_pending',
  service_type: 'electrical',
  problem_summary: 'Ổ cắm phòng khách chập chờn, có mùi khét nhẹ',
  scope_summary: 'Kiểm tra và thay ổ cắm đôi, kiểm tra dây và aptomat nhánh phòng khách.',
  address_building: 'Vinhomes Central Park',
  address_unit: 'A12.05',
  address_floor: '12',
  district: 'Bình Thạnh',
  address_access: closedAccess,
  final_price: 360_000,
  estimated_earning: 306_000,
  payment_status: null,
  gross_amount: null,
  platform_fee: null,
  worker_net: null,
  photo_urls: [],
  customer_evidence_photo_urls: [PROBLEM_PHOTO_REF],
  field_evidence_photo_urls: [],
  completion_notes: null,
  completion_photo_urls: [],
  worker_brief_guidance: brief(
    ['Ngắt aptomat nhánh trước khi tháo ổ cắm', 'Mang ổ cắm đôi 16A và đầu cos dự phòng'],
    ['Có mùi khét: kiểm tra dây chảy nhựa trước khi cấp điện lại'],
    ['Căn hộ 2PN, khách ở nhà buổi chiều'],
  ),
  scheduled_at: minutesAhead(60),
  created_at: minutesAgo(40),
  matched_at: null,
  arrived_at: null,
  work_started_at: null,
  work_paused_at: null,
  work_paused_ms: 0,
  worker_work_note: null,
  completed_at: null,
  ...extra,
})

// key order = order shown on the index page.
export const WORKER_PHASES = {
  '1-opportunity-inbox': {
    label: 'Phase 1 · Hộp việc (2.1-opportunity-inbox)',
    screen: '2.1-opportunity-inbox',
    broadcasts: [OFFER_ELECTRIC, OFFER_AC, OFFER_HANDYMAN],
    jobs: [],
  },
  '2-offer-detail': {
    label: 'Phase 2 · Chi tiết offer (2.2-offer-detail)',
    screen: '2.2-offer-detail',
    broadcasts: [OFFER_ELECTRIC, OFFER_AC, OFFER_HANDYMAN],
    jobs: [],
  },
  '3-customer-confirmation-wait': {
    label: 'Phase 3 · Chờ khách xác nhận (2.3-customer-confirmation-wait)',
    screen: '2.3-customer-confirmation-wait',
    broadcasts: [],
    jobs: [job({ status: 'worker_candidate_pending' })],
  },
  '4-route-eta': {
    label: 'Phase 4 · Đường đi / ETA (2.4-route-eta)',
    screen: '2.4-route-eta',
    broadcasts: [],
    jobs: [job({ status: 'worker_on_way', matched_at: minutesAgo(12), address_access: { ...closedAccess, release_stage: 'building_released' } })],
  },
  '5-in-progress': {
    label: 'Phase 5 · Đang làm (2.7-in-progress)',
    screen: '2.7-in-progress',
    broadcasts: [],
    jobs: [job({
      status: 'repairing',
      matched_at: minutesAgo(50),
      arrived_at: minutesAgo(18),
      work_started_at: minutesAgo(10),
      address_access: releasedAccess,
    })],
  },
  '6-scope-change': {
    label: 'Phase 6 · Báo phát sinh (2.8-scope-change)',
    screen: '2.8-scope-change',
    broadcasts: [],
    jobs: [job({
      status: 'repairing',
      matched_at: minutesAgo(50),
      arrived_at: minutesAgo(30),
      work_started_at: minutesAgo(20),
      address_access: releasedAccess,
    })],
  },
  '7-approval-wait': {
    label: 'Phase 7 · Chờ khách duyệt phát sinh (2.9-approval-wait; thợ gửi đề xuất ở 2.8 để vào màn này)',
    screen: '2.9-approval-wait',
    broadcasts: [],
    jobs: [job({
      status: 'repairing',
      matched_at: minutesAgo(60),
      arrived_at: minutesAgo(40),
      work_started_at: minutesAgo(30),
      address_access: releasedAccess,
    })],
    scope: {
      created_at: minutesAgo(3),
      evidence_photo_urls: [],
      id: 'e7a80000-0000-4000-8000-000000000005',
      kael_computed_max: 258_000,
      kael_computed_min: 258_000,
      kael_progress: null,
      price_max: 258_000,
      price_min: 258_000,
      reason: 'Dây dẫn sau ổ cắm bị chảy nhựa, cần thay một đoạn dây và đầu cos.',
      request_timing: 'on_site',
      requested_description: 'Thay đoạn dây 2.5mm² dài khoảng 3m, thay đầu cos và băng keo cách điện.',
      resume_job_status: 'repairing',
      status: 'waiting_customer_decision',
    },
  },
  '8-completion-evidence': {
    label: 'Phase 8 · Bằng chứng hoàn thành (2.10-completion-evidence)',
    screen: '2.10-completion-evidence',
    broadcasts: [],
    jobs: [job({
      status: 'repairing',
      matched_at: minutesAgo(90),
      arrived_at: minutesAgo(70),
      work_started_at: minutesAgo(60),
      address_access: releasedAccess,
    })],
  },
  '9-completion-empty': {
    label: 'Phase 9 · Chưa có hồ sơ hoàn tất (2.11-completion-submitted, thiết kế mới Mẫu 5)',
    screen: '2.11-completion-submitted',
    broadcasts: [],
    jobs: [job({
      status: 'completed_by_worker',
      matched_at: minutesAgo(120),
      arrived_at: minutesAgo(100),
      work_started_at: minutesAgo(90),
      completed_at: minutesAgo(5),
      address_access: releasedAccess,
      completion_notes: null,
      completion_photo_urls: [],
    })],
  },
  '10-completion-submitted': {
    label: 'Phase 10 · Đã gửi hồ sơ, chờ khách (2.11-completion-submitted, bố cục trạng thái cũ)',
    screen: '2.11-completion-submitted',
    broadcasts: [],
    jobs: [job({
      status: 'completed_by_worker',
      matched_at: minutesAgo(120),
      arrived_at: minutesAgo(100),
      work_started_at: minutesAgo(90),
      completed_at: minutesAgo(5),
      address_access: releasedAccess,
      completion_notes: 'Đã thay ổ cắm đôi 16A, kiểm tra aptomat nhánh, đo điện áp ổn định.',
      completion_photo_urls: [],
    })],
  },
  '11-case-closed': {
    label: 'Phase 11 · Đóng hồ sơ, chờ khách xác nhận (2.12-case-closed, Stage 10)',
    screen: '2.12-case-closed',
    broadcasts: [],
    jobs: [job({
      status: 'completed_by_worker',
      matched_at: minutesAgo(180),
      arrived_at: minutesAgo(160),
      work_started_at: minutesAgo(150),
      completed_at: minutesAgo(60),
      address_access: releasedAccess,
      final_price: 360_000,
      gross_amount: 360_000,
      platform_fee: 54_000,
      worker_net: 306_000,
    })],
  },
  '12-payment-confirmed': {
    label: 'Phase 12 · Đã nhận tiền (2.12-case-closed, Stage 11)',
    screen: '2.12-case-closed',
    broadcasts: [],
    jobs: [job({
      status: 'completed_by_worker',
      matched_at: minutesAgo(180),
      arrived_at: minutesAgo(160),
      work_started_at: minutesAgo(150),
      completed_at: minutesAgo(60),
      address_access: releasedAccess,
      final_price: 360_000,
      gross_amount: 360_000,
      platform_fee: 54_000,
      worker_net: 306_000,
      payment_status: 'direct_paid',
      payment_provider: 'direct_worker',
      payment_amount_received: 360_000,
      payment_received_at: minutesAgo(30),
    })],
    ledger: [{
      job_id: uuid(300),
      display_code: 'NS-2026-0417',
      entry_type: 'worker_credit',
      payment_state: 'available',
      gross_amount: 360_000,
      platform_fee: 54_000,
      worker_net: 306_000,
      commission_level: 1,
      commission_rate_bps: 1500,
      cash_commission_collected: 0,
      cash_commission_due: 0,
      recorded_at: minutesAgo(30),
      available_at: minutesAgo(30),
    }],
  },
}

export const DEFAULT_PHASE = '1-opportunity-inbox'

export function profileResponse() {
  return {
    id: WORKER_ID,
    avatar_url: null,
    active_minutes: 4200,
    last_active_at: minutesAgo(1),
    verification_status: 'approved',
    is_available: true,
    is_approved: true,
    is_suspended: false,
    service_types: ['electrical', 'hvac', 'handyman'],
    active_service_types: ['electrical', 'hvac', 'handyman'],
    selected_service_types: ['electrical', 'hvac', 'handyman'],
    districts: ['Bình Thạnh', 'Quận 7', 'Thủ Đức'],
    home_lat: 10.7942,
    home_lng: 106.7218,
    service_radius_km: 12,
    problem_specializations: [],
    years_experience: 6,
    rating: 4.8,
    total_jobs: 126,
    legal_name: 'Nguyễn Văn Tho',
    date_of_birth: '1992-04-12',
    gender: 'male',
    bank_account_masked: '****4821',
    bank_name: 'Vietcombank',
    has_cccd: true,
    has_cccd_front: true,
    has_cccd_back: true,
    has_selfie: true,
  }
}

export function earningsResponse(ledger = []) {
  return {
    worker_id: WORKER_ID,
    total_jobs_paid: 126,
    gross_earnings: 38_400_000,
    platform_fee_total: 5_760_000,
    net_earnings: 32_640_000,
    available_balance: 1_850_000,
    withdrawal_reserved_amount: 0,
    withdrawn_total: 30_790_000,
    collateral_reserved_amount: 0,
    cash_commission_collected_total: 0,
    cash_commission_due_total: 0,
    pending_payment_count: 0,
    pending_payment_amount: 0,
    on_hold_amount: 0,
    current_commission_level: 1,
    current_commission_rate_bps: 1500,
    recent_transactions: ledger,
    daily_earnings: [],
    from_date: null,
    to_date: null,
  }
}

export function routePreview() {
  return {
    distance_meters: 4200,
    duration_seconds: 960,
    provider: 'vietmap',
    encoded_polyline: encodePolyline(ROUTE_POINTS),
    destination: { latitude: 10.7942, longitude: 106.7218, kind: 'building' },
    fetched_at: new Date().toISOString(),
  }
}

export function performanceInsights() {
  return {
    worker_id: WORKER_ID,
    completed_job_count: 126,
    review_count: 98,
    average_rating: 4.8,
    response_rate_percent: 92,
    average_response_minutes: 3,
    on_time_rate_percent: 95,
    total_broadcast_count: 140,
    responded_broadcast_count: 129,
    accepted_broadcast_count: 126,
    scheduled_arrival_job_count: 120,
    on_time_job_count: 114,
    paid_job_count: 126,
    reconciled_earnings_vnd: 32_640_000,
    work_response_review_count: 40,
    resolved_incident_case_count: 3,
    incident_rank_bonus: 0,
    performance_score: 88,
    badges: [],
    performance_axes: [],
  }
}

// Stand-in for the VietMap static tile the real Edge route returns (600x400, no overlays of its own).
export function routeMapSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">'
    + '<rect width="600" height="400" fill="#E8EEEC"/>'
    + '<path d="M0 90H600M0 200H600M0 310H600M110 0V400M300 0V400M470 0V400" stroke="#FFFFFF" stroke-width="14"/>'
    + '<path d="M0 150L600 250" stroke="#FFFFFF" stroke-width="9"/>'
    + '<rect x="330" y="30" width="110" height="140" fill="#CFE3D6"/>'
    + '<text x="300" y="385" font-family="sans-serif" font-size="14" fill="#7A8F89" text-anchor="middle">Mock map tile (preview only)</text>'
    + '</svg>'
}

// Google polyline (precision 5), the format the real route-preview returns.
const ROUTE_POINTS = [[10.7769, 106.7009], [10.7795, 106.7062], [10.7838, 106.7131], [10.7891, 106.7168], [10.7942, 106.7218]]

function encodePolyline(points) {
  let lat = 0
  let lng = 0
  let out = ''
  const chunk = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1
    let text = ''
    while (v >= 0x20) {
      text += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    return text + String.fromCharCode(v + 63)
  }
  for (const [la, ln] of points) {
    const nextLat = Math.round(la * 1e5)
    const nextLng = Math.round(ln * 1e5)
    out += chunk(nextLat - lat) + chunk(nextLng - lng)
    lat = nextLat
    lng = nextLng
  }
  return out
}

// Job detail as GET /jobs/:id returns it, built from the worker-list row of the current phase.
export function jobDetailResponse(phase, jobId) {
  const row = phase.jobs.find((entry) => entry.id === jobId)
  if (!row) return null
  return {
    broadcast_state: null,
    current_job_incident: null,
    current_scope_change: phase.scope ?? null,
    job: {
      ...row,
      address_district: row.district,
      confirmed_at: null,
      description: row.scope_summary ?? row.problem_summary,
      kael_advisory: null,
      kael_complexity: 'low',
      kael_estimate_card_v3: null,
      kael_price_max: null,
      kael_price_min: null,
      kael_problem_identified: row.problem_summary,
      kael_progress: null,
      kael_worker_brief_core: row.worker_brief_guidance ?? null,
      kael_worker_brief_guidance: row.worker_brief_guidance ?? null,
      paid_at: null,
      problem_chips: [row.problem_summary],
      reviewed_at: null,
    },
    matching_state: null,
    worker: null,
    worker_travel: null,
  }
}

// Scope-change flow answers: the worker describes the change, Kael prices it, the worker sends it to the customer.
export function incidentResponse(jobId, status = 'ready_for_scope_proposal') {
  const now = new Date().toISOString()
  return {
    id: 'a8c90000-0000-4000-8000-000000000011',
    job_id: jobId,
    status,
    evidence_status: 'ready',
    last_summary: 'Dây dẫn sau ổ cắm bị chảy nhựa, cần thay một đoạn dây.',
    last_question: null,
    last_next_actor: null,
    created_at: now,
    updated_at: now,
  }
}

export function scopeQuote(jobId) {
  return {
    schema_version: 'scope_change_worker_quote.v1',
    quote_id: 'b9da0000-0000-4000-8000-000000000012',
    incident_id: 'a8c90000-0000-4000-8000-000000000011',
    job_id: jobId,
    customer_total: 258_000,
    platform_fee: 38_700,
    worker_net: 219_300,
    commission_level: 1,
    commission_rate_bps: 1500,
    reference_price_min: 140_000,
    reference_price_max: 375_000,
    baseline_used: 'electrical:replace_wiring:small:hcmc_all',
    baseline_source: 'multi_source_hcmc_2026_08',
    selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
    calculation: 'Trung vị nguồn đã kiểm chứng 258.000 VND; phí nền tảng 15%.',
    expires_at: new Date(Date.now() + 25 * 60_000).toISOString(),
  }
}

export function scopeChangeCreated(jobId) {
  return {
    scope_change_id: 'e7a80000-0000-4000-8000-000000000005',
    job_id: jobId,
    status: 'waiting_customer_decision',
    created_at: new Date().toISOString(),
  }
}

// Stand-in for the customer's photo of the problem (a scorched wall socket); the real one comes from private storage.
export function problemPhotoSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">'
    + '<defs><linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9d3c7"/><stop offset="1" stop-color="#bfb8aa"/></linearGradient>'
    + '<radialGradient id="burn" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#1c1410" stop-opacity="0.95"/><stop offset="1" stop-color="#1c1410" stop-opacity="0"/></radialGradient></defs>'
    + '<rect width="900" height="900" fill="url(#wall)"/>'
    + '<rect x="250" y="250" width="400" height="400" rx="40" fill="#f2efe8" stroke="#a9a293" stroke-width="6"/>'
    + '<circle cx="450" cy="450" r="170" fill="url(#burn)"/>'
    + '<rect x="360" y="380" width="26" height="90" rx="8" fill="#2b2420"/><rect x="514" y="380" width="26" height="90" rx="8" fill="#2b2420"/>'
    + '<circle cx="450" cy="520" r="22" fill="#2b2420"/>'
    + '<text x="450" y="760" font-family="sans-serif" font-size="30" fill="#6d665a" text-anchor="middle">Mock customer photo (preview only)</text>'
    + '</svg>'
}
