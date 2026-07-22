import { agenticEstimateProblemLabel } from '../v21/agentic-estimate-display-model'

const estimate = {
  advisory: null,
  complexity: 'medium' as const,
  confidence: 0.67,
  disclaimer: 'Ước tính cần được xác nhận.',
  price_max: 500000,
  price_min: 250000,
  problem_category: 'outlet_or_switch_broken',
  problem_summary: 'electrical: outlet_or_switch_broken',
  service_type: 'electrical' as const,
}

describe('Kael agentic estimate display model', () => {
  it('localizes the canonical electrical outlet taxonomy instead of showing pending data', () => {
    expect(agenticEstimateProblemLabel(estimate, 'vi')).toBe('Ổ cắm/công tắc hỏng')
    expect(agenticEstimateProblemLabel(estimate, 'en')).toBe('Outlet or switch issue')
  })
})
