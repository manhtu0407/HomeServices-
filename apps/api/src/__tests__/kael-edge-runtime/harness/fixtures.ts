export function quoteReadyPlumbingDiagnosisScope() {
  return {
    version: 1,
    service_type: 'plumbing',
    profile_id: 'water_diagnose',
    case_phase: 'offer_review',
    facts: {
      customer_goal: 'Sửa rò rỉ đường ống',
      address_district: 'q7',
    },
    missing_facts: [],
    evidence: [],
    safety_flags: [],
    scope_summary: 'Kiểm tra và xử lý rò rỉ đường ống trong căn hộ.',
    quote_ready: true,
    quote_blockers: [],
    worker_requirements: ['water_leak_diagnosis'],
    confidence: 0.82,
    next_action: { kind: 'prepare_offer' },
    updated_at: '2026-07-11T00:00:00.000Z',
  }
}
