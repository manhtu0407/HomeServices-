import {
  agenticEstimateHeaderTitle,
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
  it('uses only the localized service name for the estimate response title', () => {
    const plumbingEstimate = {
      ...estimate,
      service_type: 'plumbing' as const,
    }

    expect(agenticEstimateHeaderTitle(plumbingEstimate, 'vi')).toBe('Sửa nước')
    expect(agenticEstimateHeaderTitle(plumbingEstimate, 'en')).toBe('Plumbing repair')
  })

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

    const model = agenticEstimateSupportingPhase(supportedEstimate, 'vi')

    expect(model?.title).toBe('Kael đã kiểm tra')
    expect(model?.rows[0]).toEqual({
      detail: '2 ảnh · 3 khung hình video · 1 bản chép lời đã duyệt.',
      key: 'evidence',
      label: 'Bằng chứng',
    })
    expect(model?.rows.filter((row) => row.key.startsWith('evidence-photo-'))).toHaveLength(2)
    expect(model?.rows.filter((row) => row.key.startsWith('evidence-video_frame-'))).toHaveLength(3)
    expect(model?.rows.find((row) => row.key === 'scope')).toMatchObject({
      detail: 'Ổ cắm/công tắc hỏng',
      label: 'Thông tin Kael đã nhận',
      layout: 'stacked',
      sections: [{ label: 'Mô tả chính', value: 'Ổ cắm/công tắc hỏng' }],
    })
    expect(model?.rows.find((row) => row.key === 'price')).toMatchObject({
      detail: 'Mức tin cậy của khoảng giá: Vừa.\nKael đối chiếu phạm vi đã xác nhận, mức độ vừa và mức giá cơ sở cùng 4 nguồn giá được chấp nhận, gồm 3 nguồn độ tin cậy cao.\nKhoảng này chưa bao gồm phần phát sinh ngoài phạm vi đã xác nhận.',
      label: 'Cơ sở giá',
    })
    expect(model?.valueStatement).toBe(
      'Khoảng giá gắn với phạm vi hiện tại; phần phát sinh chỉ được tính sau khi bạn xác nhận.',
    )
  })

  it('builds a high-trust explanation from evidence-linked findings without presenting hypotheses as facts', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          findings: [
            {
              confidence: 'high' as const,
              evidence_index: 1,
              evidence_kind: 'photo' as const,
              observation: 'Mặt ổ cắm có vùng sẫm màu quanh khe cắm.',
              possible_meaning: 'Có thể đã phát nhiệt tại điểm tiếp xúc.',
            },
          ],
          photo_count: 1,
          skipped: false,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 4,
          high_trust_source_count: 3,
          quorum_met: true,
        },
        problem: {
          remaining_uncertainty: 'Ảnh không cho thấy phần dây phía sau mặt ổ cắm.',
          recommended_scope: 'Thợ kiểm tra điểm tiếp xúc, dây dẫn phía sau và thay phần hỏng sau khi xác nhận hiện trạng.',
          severity_indicators: ['Có dấu hiệu phát nhiệt gần khe cắm.'],
          summary: 'Ổ cắm có dấu hiệu tiếp xúc điện không ổn định và phát nhiệt cục bộ.',
        },
      },
      complexity_reasoning: 'Cần mở mặt ổ cắm để kiểm tra phần tiếp xúc và dây phía sau.',
      price_source: 'baseline_with_market',
    }

    const model = agenticEstimateSupportingPhase(supportedEstimate, 'vi')

    expect(model?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        detail: expect.stringContaining('Ổ cắm có dấu hiệu tiếp xúc điện không ổn định'),
        key: 'problem',
        label: 'Vấn đề Kael nhận thấy',
      }),
      expect.objectContaining({
        key: 'evidence-photo-1',
        label: 'Hình 1',
        sections: [
          { label: 'Mức tin cậy', value: 'Cao' },
          { label: 'Quan sát', value: 'Mặt ổ cắm có vùng sẫm màu quanh khe cắm.' },
          { label: 'Khả năng liên quan', value: 'Có thể đã phát nhiệt tại điểm tiếp xúc.' },
        ],
      }),
      expect.objectContaining({
        detail: expect.stringContaining('Thợ kiểm tra điểm tiếp xúc'),
        key: 'resolution',
        label: 'Hướng xử lý đề xuất',
      }),
      expect.objectContaining({
        detail: expect.stringContaining('mức giá cơ sở cùng 4 nguồn giá được chấp nhận'),
        key: 'price',
        label: 'Vì sao có khoảng giá này',
      }),
      expect.objectContaining({
        detail: 'Ảnh không cho thấy phần dây phía sau mặt ổ cắm.',
        key: 'uncertainty',
        label: 'Điều chưa thể kết luận',
      }),
    ]))
    const priceReason = model?.rows.find((row) => row.key === 'price')?.detail
    const problemReason = model?.rows.find((row) => row.key === 'problem')?.detail
    expect(priceReason).toContain('mức độ vừa')
    expect(priceReason).toContain('Mức tin cậy của khoảng giá: Vừa')
    expect(priceReason).toContain('ngoài phạm vi')
    expect(problemReason).not.toContain('..')
    expect(JSON.stringify(model)).not.toMatch(/chắc chắn|100%|Perplexity|Backend/)
  })

  it('keeps one truthful analysis row per supplied image and separates added scope context', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          analysis_status: 'analyzed' as const,
          findings: [
            {
              confidence: 'high' as const,
              evidence_index: 1,
              evidence_kind: 'photo' as const,
              observation: 'Khớp ren có giọt nước đọng ngay sau khi xả bồn.',
              possible_meaning: 'Có thể gioăng tại khớp nối đã lỏng hoặc hao mòn.',
            },
            {
              confidence: 'medium' as const,
              evidence_index: 3,
              evidence_kind: 'photo' as const,
              observation: 'Đáy tủ chỉ ẩm cục bộ và chưa thấy vệt nước lan rộng.',
              possible_meaning: null,
            },
          ],
          photo_count: 3,
          skipped: false,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 3,
          high_trust_source_count: 2,
          quorum_met: true,
        },
        problem: {
          remaining_uncertainty: 'Chưa thấy phần gioăng nằm bên trong khớp ren.',
          recommended_scope: 'Thợ kiểm tra khớp ren và gioăng trước khi thay linh kiện.',
          severity_indicators: ['Rò chỉ xuất hiện trong lúc xả bồn.'],
          summary: 'Rò rỉ cục bộ tại khớp ren ống thoát dưới bồn rửa.',
        },
      },
      complexity_reasoning: 'Phạm vi và bằng chứng đã xác nhận xếp yêu cầu ở mức độ vừa.',
      price_source: 'baseline_with_market',
    }
    const diagnosisScope = {
      facts: {
        customer_goal: 'Tôi cần sửa khớp ren dưới bồn rửa đang rò từng giọt khi xả bồn.',
        latest_customer_detail: [
          'Tôi cần sửa khớp ren dưới bồn rửa đang rò từng giọt khi xả bồn.',
          'Thông tin bổ sung: khớp nối khô lại sau khoảng hai phút.',
          'Bổ sung lần hai: đáy tủ chỉ ẩm cục bộ, chưa lan rộng.',
        ].join('\n\n'),
      },
    }

    const model = agenticEstimateSupportingPhase(supportedEstimate, 'vi', diagnosisScope, [
      { evidence_index: 1, evidence_kind: 'photo', url: 'https://media.test/photo-1' },
      { evidence_index: 2, evidence_kind: 'photo', url: 'https://media.test/photo-2' },
      { evidence_index: 3, evidence_kind: 'photo', url: 'https://media.test/photo-3' },
    ])
    const imageRows = model?.rows.filter((row) => row.key.startsWith('evidence-photo-'))
    const scopeRow = model?.rows.find((row) => row.key === 'scope')

    expect(imageRows?.map((row) => row.key)).toEqual([
      'evidence-photo-1',
      'evidence-photo-2',
      'evidence-photo-3',
    ])
    expect(imageRows?.map((row) => row.mediaUrl)).toEqual([
      'https://media.test/photo-1',
      'https://media.test/photo-2',
      'https://media.test/photo-3',
    ])
    expect(imageRows?.[0]?.sections).toEqual([
      { label: 'Mức tin cậy', value: 'Cao' },
      { label: 'Quan sát', value: 'Khớp ren có giọt nước đọng ngay sau khi xả bồn.' },
      { label: 'Khả năng liên quan', value: 'Có thể gioăng tại khớp nối đã lỏng hoặc hao mòn.' },
    ])
    expect(imageRows?.[1]).toMatchObject({
      detail: 'Hình này chưa có chi tiết đủ rõ để dùng vào kết luận.',
      label: 'Hình 2',
    })
    expect(imageRows?.[2]?.sections).toEqual([
      { label: 'Mức tin cậy', value: 'Vừa' },
      { label: 'Quan sát', value: 'Đáy tủ chỉ ẩm cục bộ và chưa thấy vệt nước lan rộng.' },
    ])
    expect(scopeRow).toMatchObject({
      key: 'scope',
      label: 'Thông tin Kael đã nhận',
      layout: 'columns',
      sections: [
        {
          label: 'Mô tả chính',
          value: 'Tôi cần sửa khớp ren dưới bồn rửa đang rò từng giọt khi xả bồn.',
        },
        {
          label: 'Thông tin bổ sung',
          value: 'Khớp nối khô lại sau khoảng hai phút.\nĐáy tủ chỉ ẩm cục bộ, chưa lan rộng.',
        },
      ],
    })
    expect(scopeRow?.detail).not.toContain('Mô tả đã xác nhận:')
    expect(scopeRow?.detail).not.toContain('Phạm vi và bằng chứng đã xác nhận')
  })

  it('separates inline additional information returned by the runtime', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          photo_count: 0,
          skipped: true,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 0,
          high_trust_source_count: 0,
          quorum_met: false,
        },
      },
    }
    const diagnosisScope = {
      facts: {
        customer_goal: 'Tôi cần sửa khớp ren dưới bồn rửa. Thông tin bổ sung: khớp chỉ rò khi xả bồn.',
        latest_customer_detail: 'Tôi cần sửa khớp ren dưới bồn rửa.Thông tin bổ sung: khớp chỉ rò khi xả bồn.',
      },
    }

    const scopeRow = agenticEstimateSupportingPhase(supportedEstimate, 'vi', diagnosisScope)
      ?.rows.find((row) => row.key === 'scope')

    expect(scopeRow).toMatchObject({
      layout: 'columns',
      sections: [
        { label: 'Mô tả chính', value: 'Tôi cần sửa khớp ren dưới bồn rửa.' },
        { label: 'Thông tin bổ sung', value: 'Khớp chỉ rò khi xả bồn.' },
      ],
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
    const priceDetail = supportingPhase?.rows.find((row) => row.key === 'price')?.detail
    expect(priceDetail).toContain('dữ liệu giá được đối chiếu theo phạm vi hiện tại')
    expect(priceDetail).toContain('ngoài phạm vi')
    expect(JSON.stringify(supportingPhase)).not.toMatch(/Perplexity|Backend/)
  })

  it('shows an honest received-but-unavailable image state without inventing a finding', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          analysis_status: 'unavailable' as const,
          photo_count: 1,
          skipped: false,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 2,
          high_trust_source_count: 1,
          quorum_met: false,
        },
        problem: {
          remaining_uncertainty: 'Kael đã nhận ảnh nhưng chưa thể xác nhận chi tiết trong ảnh.',
          recommended_scope: 'Thợ cần kiểm tra trực tiếp vị trí được mô tả.',
          severity_indicators: [],
          summary: 'electrical: outlet_or_switch_broken',
        },
      },
      price_source: 'baseline_with_market',
    }

    const model = agenticEstimateSupportingPhase(supportedEstimate, 'vi')

    expect(model?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        detail: 'Ổ cắm/công tắc hỏng',
        key: 'problem',
        label: 'Vấn đề đã xác nhận',
      }),
      expect.objectContaining({
        detail: expect.stringContaining('đã nhận 1 ảnh'),
        key: 'evidence',
        label: 'Trạng thái bằng chứng',
      }),
      expect.objectContaining({
        detail: expect.stringContaining('chưa đủ nguồn giá tin cậy'),
        key: 'price',
      }),
    ]))
    expect(model?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'evidence-photo-1',
        label: 'Hình 1',
        sections: [{
          label: 'Trạng thái',
          value: expect.stringContaining('không dùng nó cho kết luận hoặc khoảng giá'),
        }],
      }),
    ]))
    expect(JSON.stringify(model)).not.toMatch(/electrical:/)
  })

  it('uses both accepted and high-trust market counts in the price basis', () => {
    const supportedEstimate = {
      ...estimate,
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1' as const,
        evidence: {
          analysis_status: 'analyzed' as const,
          photo_count: 1,
          skipped: false,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 4,
          high_trust_source_count: 3,
          quorum_met: true,
        },
      },
      price_source: 'baseline_with_market',
    }

    const priceDetail = agenticEstimateSupportingPhase(supportedEstimate, 'vi')
      ?.rows.find((row) => row.key === 'price')?.detail

    expect(priceDetail).toContain('4 nguồn giá được chấp nhận')
    expect(priceDetail).toContain('3 nguồn độ tin cậy cao')
  })

  it('does not claim completed evidence checks for a legacy estimate without a receipt', () => {
    expect(agenticEstimateSupportingPhase(estimate, 'vi')).toBeNull()
  })
})
