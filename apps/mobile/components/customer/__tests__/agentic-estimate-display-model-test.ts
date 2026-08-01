import {
  agenticEstimateSupportingPhase,
  agenticEstimatePriceExplanation,
  agenticEstimateProblemLabel,
} from '../kael-chat/agentic-estimate-display-model'

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

  it('localizes the canonical flickering-light taxonomy instead of hiding it as pending', () => {
    const flickeringLightEstimate = {
      ...estimate,
      problem_category: 'flickering_light',
      problem_summary: 'electrical: flickering_light',
    }

    expect(agenticEstimateProblemLabel(flickeringLightEstimate, 'vi')).toBe('Đèn chập chờn')
    expect(agenticEstimateProblemLabel(flickeringLightEstimate, 'en')).toBe('Flickering light')
  })

  it('breaks the Vietnamese estimate rationale into concise, decision-ready lines', () => {
    expect(agenticEstimatePriceExplanation(estimate, 'vi')).toBe(
      'Khoảng ước tính theo phạm vi hiện tại.',
    )
  })

  it('turns the backend analysis receipt into a concise supporting phase', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          photo_count: 2,
          skipped: false,
          video_frame_count: 3,
          voice_transcript_count: 1,
        },
        market: {
          accepted_source_count: 4,
          high_trust_source_count: 3,
          quorum_met: true,
        },
      },
      complexity_reasoning: 'Phạm vi hiện tại được xếp mức vừa.',
      market_signals: 'Tổng hợp 4 nguồn đã kiểm chứng.',
      price_source: 'baseline_with_market',
    }

    expect(agenticEstimateSupportingPhase(supportedEstimate, 'vi')).toEqual({
      title: 'Kael đã kiểm tra',
      rows: [
        {
          detail: '2 ảnh · 3 khung hình video · 1 bản chép lời đã duyệt.',
          key: 'evidence',
          label: 'Bằng chứng',
        },
        {
          detail: 'Ổ cắm/công tắc hỏng.\nPhạm vi hiện tại được xếp mức vừa.',
          key: 'scope',
          label: 'Phạm vi',
        },
        {
          detail: 'Mức giá cơ sở và 4 nguồn giá đã kiểm chứng.',
          key: 'price',
          label: 'Cơ sở giá',
        },
      ],
      valueStatement: 'Khoảng giá gắn với phạm vi hiện tại; phần phát sinh chỉ được tính sau khi bạn xác nhận.',
    })
  })

  it('keeps provider and backend details out of the customer price explanation', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          photo_count: 1,
          skipped: false,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 0,
          high_trust_source_count: 0,
          quorum_met: true,
        },
      },
      market_signals: 'Perplexity và Backend đã trả dữ liệu giá.',
    }

    const supportingPhase = agenticEstimateSupportingPhase(supportedEstimate, 'vi')
    expect(supportingPhase?.rows.find((row) => row.key === 'price')?.detail).toBe(
      'Dữ liệu giá đã được đối chiếu theo phạm vi hiện tại.',
    )
    expect(JSON.stringify(supportingPhase)).not.toMatch(/Perplexity|Backend/)
  })

  it('does not claim completed evidence checks for a legacy estimate without a receipt', () => {
    expect(agenticEstimateSupportingPhase(estimate, 'vi')).toBeNull()
  })
})
