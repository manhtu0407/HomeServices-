import type { KaelChatResponse, KaelChatTurn } from '@/lib/api-types'

import { rememberCaseWorkPhotoDrafts } from '../kael-chat/case-work-turn-media'
import { deriveCustomerKaelPresentation } from '../kael-chat/customer-kael-presentation'

function derivePresentation({
  assistantTurns = [],
  catalogTurns = [],
  chat = null,
  deal = null,
  intakeDisplayMessage = null,
  jobIncidentMessages = [],
  processLines = null,
  submittingAgenticEvidence = false,
  turns = [],
}: {
  assistantTurns?: Parameters<typeof deriveCustomerKaelPresentation>[0]['assistantTurns']
  catalogTurns?: Parameters<typeof deriveCustomerKaelPresentation>[0]['catalogTurns']
  chat?: KaelChatResponse | null
  deal?: Parameters<typeof deriveCustomerKaelPresentation>[0]['deal']
  intakeDisplayMessage?: string | null
  jobIncidentMessages?: Parameters<typeof deriveCustomerKaelPresentation>[0]['jobIncidentMessages']
  processLines?: Parameters<typeof deriveCustomerKaelPresentation>[0]['processLines']
  submittingAgenticEvidence?: boolean
  turns?: KaelChatTurn[]
}) {
  return deriveCustomerKaelPresentation({
    assistantTurns,
    caseEditOpen: false,
    catalogTurns,
    chat,
    deal,
    intakeDisplayMessage,
    jobIncidentMessages,
    language: 'vi',
    loading: false,
    mode: 'case',
    pendingDraft: null,
    pendingDraftLocalizedMessage: null,
    processLines,
    routeDraftEvidencePending: false,
    submittingAgenticEvidence,
    turns,
  })
}

function analysisChat(required?: boolean) {
  return {
    session: {
      case_phase: 'analysis',
      diagnosis_scope: {
        next_action: {
          evidence_kind: 'any',
          kind: 'request_evidence',
          prompt: 'Nếu thuận tiện, thêm ảnh/video hoặc bản chép lời về hiện trạng.',
          ...(required === undefined ? {} : { required }),
        },
        quote_blockers: [],
      },
      id: 'session-a',
      service_type: 'electrical',
      status: 'collecting_evidence',
    },
    turns: [],
  } as unknown as KaelChatResponse
}

describe('customer Kael presentation', () => {
  it('keeps signed evidence previews available for Price Reasoning', () => {
    const chat = analysisChat(false)
    chat.session.evidence_previews = [
      { evidence_index: 1, evidence_kind: 'photo', url: 'https://media.test/photo-1' },
      { evidence_index: 2, evidence_kind: 'photo', url: 'https://media.test/photo-2' },
    ]

    expect(derivePresentation({ chat }).evidencePreviews).toEqual(chat.session.evidence_previews)
  })

  it('formats a persisted Basic Intake turn before rendering it in the case thread', () => {
    const presentation = derivePresentation({
      turns: [{
        id: 'customer-summary',
        role: 'customer',
        text_content: [
          'Dịch vụ: Sửa điện',
          'Vấn đề: Ổ cắm/công tắc hỏng',
          'Thời gian: CN 19/07 · Bắt đầu lúc 14:[house-no]',
          'Mô tả: Ổ điện bị hư.',
        ].join('\n'),
      }] as unknown as KaelChatTurn[],
    })

    expect(presentation.agenticVisibleTurns[0]?.text_content).toBe([
      'Dịch vụ: Sửa điện',
      'Vấn đề: Ổ cắm/công tắc hỏng',
      'Thời gian: CN 19/07 · Bắt đầu khoảng 14 giờ',
      'Mô tả: Ổ điện bị hư.',
    ].join('\n\n'))
  })

  it('keeps the local Basic Intake summary after the backend consumes the draft', () => {
    const rawSummary = 'Thời gian: 14:00\nMô tả: Ổ điện trong căn hộ bị hỏng.'
    const presentation = derivePresentation({
      chat: analysisChat(false),
      intakeDisplayMessage: rawSummary,
      turns: [
        { id: 'customer-1', role: 'customer', text_content: 'Thời gian: 14:[house-no]\nMô tả: [unit]ộ bị hỏng.' },
        { id: 'kael-1', role: 'kael', text_content: 'Vị trí ở đâu trong [unit]ộ?', content_type: 'clarification' },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.pendingDraftMessage).toBe(rawSummary)
    expect(presentation.showPendingDraftBubble).toBe(true)
    expect(presentation.agenticVisibleTurns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'kael-1', text_content: 'Vị trí ở đâu trong căn hộ?' }),
    ]))
  })

  it('shows one pending intake bubble when later evidence turns repeat the same request text', () => {
    const message = 'Tôi cần sửa nước. Khớp ren dưới bồn rửa đang rò từng giọt. Tôi đã khóa van. Tôi cần thợ tại Quận 3.'
    const presentation = derivePresentation({
      chat: analysisChat(false),
      intakeDisplayMessage: message,
      turns: [
        { id: 'initial-customer', role: 'customer', text_content: message },
        { id: 'kael-evidence', role: 'kael', text_content: 'Bạn thêm ảnh hiện trạng nếu thuận tiện.' },
        { id: 'evidence-customer', role: 'customer', text_content: message },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.showPendingDraftBubble).toBe(true)
    expect(presentation.agenticVisibleTurns.map((turn) => turn.id)).toEqual([
      'kael-evidence',
    ])
  })

  it('renders one copy when persisted evidence submission repeats a detailed intake', () => {
    const message = 'Tôi cần sửa nước. Khớp ren của ống thoát ngay dưới bồn rửa bếp đang rò từng giọt, có nước đọng và đáy tủ bị ẩm nhưng chưa tràn ra sàn. Tôi đã khóa van. Tôi cần thợ kiểm tra từ 10:00 đến 12:00 ngày 05/08/2026 tại Chung cư An Gia, Phường Võ Thị Sáu, Quận 3.'
    const presentation = derivePresentation({
      turns: [
        { id: 'initial-customer', role: 'customer', text_content: message },
        { id: 'kael-evidence', role: 'kael', text_content: 'Bạn thêm ảnh hiện trạng nếu thuận tiện.' },
        { id: 'evidence-customer', role: 'customer', text_content: message },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.agenticVisibleTurns.map((turn) => turn.id)).toEqual([
      'initial-customer',
      'kael-evidence',
    ])
  })

  describe('Work handling photo turns', () => {
    const owner = 'supabase://kael-chat-media/00000000-0000-4000-8000-000000000001/kael-chat'
    const photoOne = `${owner}/model_vision/photo-1.jpg`
    const photoTwo = `${owner}/model_vision/photo-2.jpg`
    const frame = `${owner}/model_vision/frame-1.jpg`
    const original = `${owner}/private_video_original/video-1.mp4`
    function photoChat() {
      const chat = analysisChat(false)
      chat.session.diagnosis_scope = {
        ...chat.session.diagnosis_scope,
        evidence: [
          { kind: 'video_original_private', model_eligible: false, ref: original },
          { kind: 'photo', model_eligible: true, ref: photoOne },
          { kind: 'video_frame', model_eligible: true, ref: frame },
          { kind: 'photo', model_eligible: true, ref: photoTwo },
        ],
      }
      chat.session.evidence_previews = [
        { evidence_index: 1, evidence_kind: 'photo', url: 'https://media.test/photo-1' },
        { evidence_index: 1, evidence_kind: 'video_frame', url: 'https://media.test/frame-1' },
      ]
      return chat
    }
    const intake = 'Dịch vụ: Sửa điện\nVấn đề: Ổ cắm/công tắc hỏng\nMô tả: Ổ điện nhà tôi bị hư, theo đó là cầu dao điện bị hư hỏng luôn'

    it('shows the photos alone in place of the media-only stand-in text', () => {
      const presentation = derivePresentation({
        chat: photoChat(),
        turns: [
          { id: 'intake', role: 'customer', text_content: intake, media_refs: [] },
          { id: 'kael-ask', role: 'kael', text_content: 'Bạn gửi ảnh cầu dao giúp Kael.', media_refs: [] },
          { id: 'photo-turn', role: 'customer', text_content: 'Đã gửi ảnh/video.', media_refs: [photoOne, photoTwo] },
        ] as unknown as KaelChatTurn[],
      })

      const photoTurn = presentation.agenticVisibleTurns.find((turn) => turn.id === 'photo-turn')
      expect(photoTurn?.text_content).toBe('')
      expect(photoTurn?.images).toHaveLength(2)
    })

    it('keeps the sent-media text beside the photos when the turn also carried a video', () => {
      const presentation = derivePresentation({
        chat: photoChat(),
        turns: [
          { id: 'intake', role: 'customer', text_content: intake, media_refs: [] },
          { id: 'kael-ask', role: 'kael', text_content: 'Bạn gửi ảnh cầu dao giúp Kael.', media_refs: [] },
          { id: 'photo-turn', role: 'customer', text_content: 'Đã gửi ảnh/video.', media_refs: [photoOne, frame, original, photoTwo] },
        ] as unknown as KaelChatTurn[],
      })

      const photoTurn = presentation.agenticVisibleTurns.find((turn) => turn.id === 'photo-turn')
      expect(photoTurn?.text_content).toBe('Đã gửi ảnh/video.')
      expect(photoTurn?.images).toEqual([
        { key: photoOne, status: 'available', uri: 'https://media.test/photo-1' },
        { key: photoTwo, status: 'unavailable', uri: null },
      ])
    })

    it('keeps an evidence turn that repeats the request as a photo-only bubble instead of dropping it', () => {
      const presentation = derivePresentation({
        chat: photoChat(),
        turns: [
          { id: 'intake', role: 'customer', text_content: intake, media_refs: [] },
          { id: 'kael-ask', role: 'kael', text_content: 'Bạn gửi ảnh cầu dao giúp Kael.', media_refs: [] },
          { id: 'evidence-turn', role: 'customer', text_content: intake, media_refs: [photoOne] },
        ] as unknown as KaelChatTurn[],
      })

      const evidenceTurn = presentation.agenticVisibleTurns.find((turn) => turn.id === 'evidence-turn')
      expect(evidenceTurn).toEqual(expect.objectContaining({ text_content: '' }))
      expect(evidenceTurn?.images).toHaveLength(1)
      expect(presentation.agenticVisibleTurns.find((turn) => turn.id === 'intake')?.text_content).not.toBe('')
    })

    it('keeps words the customer typed beside their photos', () => {
      const presentation = derivePresentation({
        chat: photoChat(),
        turns: [
          { id: 'photo-turn', role: 'customer', text_content: 'Cầu dao nhảy sau khi bật lại.', media_refs: [photoOne] },
        ] as unknown as KaelChatTurn[],
      })

      expect(presentation.agenticVisibleTurns[0]).toEqual(expect.objectContaining({
        images: [expect.objectContaining({ key: photoOne })],
        text_content: 'Cầu dao nhảy sau khi bật lại.',
      }))
    })

    it('keeps the stand-in text for a video-only turn rather than showing extracted frames', () => {
      const presentation = derivePresentation({
        chat: photoChat(),
        turns: [
          { id: 'video-turn', role: 'customer', text_content: 'Đã gửi ảnh/video.', media_refs: [frame, original] },
        ] as unknown as KaelChatTurn[],
      })

      expect(presentation.agenticVisibleTurns[0]).toEqual(expect.objectContaining({
        images: [],
        text_content: 'Đã gửi ảnh/video.',
      }))
    })

    it('shows a just-sent photo from the device before any signed preview exists', () => {
      const sentRef = `${owner}/model_vision/just-sent.jpg`
      rememberCaseWorkPhotoDrafts(
        [{ kind: 'photo', model_eligible: true, ref: sentRef }],
        [{ type: 'image', uri: 'file:///IMG_1453.jpg' }],
      )
      const presentation = derivePresentation({
        chat: analysisChat(false),
        turns: [
          { id: 'photo-turn', role: 'customer', text_content: 'Đã gửi ảnh/video.', media_refs: [sentRef] },
        ] as unknown as KaelChatTurn[],
      })

      expect(presentation.agenticVisibleTurns[0]?.images).toEqual([
        { key: sentRef, status: 'available', uri: 'file:///IMG_1453.jpg' },
      ])
    })
  })

  it('keeps the Basic Intake summary visible while Kael processes a follow-up turn', () => {
    const rawSummary = 'Dịch vụ: Sửa điện\n\nMô tả: Cầu dao nhà bị hư.'
    const presentation = derivePresentation({
      chat: analysisChat(false),
      intakeDisplayMessage: rawSummary,
      processLines: {
        activeIndex: 0,
        collapse: null,
        lines: [],
        origin: 'local',
        prompt: 'Tôi cũng chưa rõ',
        scenarioId: 'work_plan',
        streamId: 'local:test-work-plan',
        visibleCount: 1,
      },
      turns: [
        { id: 'customer-summary', role: 'customer', text_content: rawSummary },
        { id: 'kael-question', role: 'kael', text_content: 'Tình trạng cấp điện hiện tại là gì?' },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.showPendingDraftBubble).toBe(true)
    expect(presentation.pendingDraftMessage).toBe(rawSummary)
    expect(presentation.agenticVisibleTurns).toEqual([
      expect.objectContaining({ id: 'kael-question' }),
    ])
  })

  it('keeps the complete persisted transcript after Case Work creates a deal', () => {
    const rawSummary = 'Dịch vụ: Sửa vặt & Lắp đặt nhỏ\n\nMô tả: Khoan tường để lắp giá treo.'
    const presentation = derivePresentation({
      deal: { id: 'job-a' } as Parameters<typeof deriveCustomerKaelPresentation>[0]['deal'],
      intakeDisplayMessage: rawSummary,
      turns: [
        { id: 'customer-summary', role: 'customer', text_content: rawSummary },
        { id: 'kael-question', role: 'kael', text_content: 'Bạn có ảnh vị trí cần khoan không?' },
        { id: 'customer-answer', role: 'customer', text_content: 'Tôi sẽ gửi ảnh ngay.' },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.showPendingDraftBubble).toBe(false)
    expect(presentation.agenticVisibleTurns.map((turn) => turn.id)).toEqual([
      'customer-summary',
      'kael-question',
      'customer-answer',
    ])
  })

  it('keeps incident audit messages inside the dedicated scope-review phase instead of prepending them to chat', () => {
    const presentation = derivePresentation({
      deal: { id: 'job-a' } as Parameters<typeof deriveCustomerKaelPresentation>[0]['deal'],
      jobIncidentMessages: [{
        content: 'Kael Công việc: Kael đã đối chiếu phần việc phát sinh.',
        id: 'incident-kael-1',
        sender_role: 'kael',
      }] as Parameters<typeof deriveCustomerKaelPresentation>[0]['jobIncidentMessages'],
    })

    expect(presentation.caseAssistantTurns).toEqual([])
    expect(presentation.agenticVisibleTurns).toEqual([])
  })

  it('keeps the Pre-Step exchange but removes its duplicated persisted customer turn', () => {
    const message = 'Tôi cần sửa nước. Khớp ren dưới bồn rửa đang rò từng giọt. Tôi đã khóa van. Tôi cần thợ tại Quận 3.'
    const presentation = derivePresentation({
      assistantTurns: [
        { id: 'local-customer', role: 'customer', surface: 'customer_case', text_content: message },
        { id: 'local-kael', role: 'kael', surface: 'customer_case', text_content: 'Bạn xác nhận thông tin nhé.' },
      ],
      turns: [
        { id: 'persisted-customer', role: 'customer', text_content: message },
        { id: 'persisted-kael', role: 'kael', text_content: 'Bạn thêm ảnh hiện trạng nếu thuận tiện.' },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.caseAssistantTurns.map((turn) => turn.id)).toEqual([
      'local-customer',
      'local-kael',
    ])
    expect(presentation.agenticVisibleTurns.map((turn) => turn.id)).toEqual([
      'persisted-kael',
    ])
  })

  it('allows skipping only when the server marks the evidence request optional', () => {
    const optionalPresentation = derivePresentation({ chat: analysisChat(false) })

    expect(optionalPresentation.serverEvidenceRequired).toBe(false)
    expect(optionalPresentation.serverEvidencePrompt).toBe(
      'Nếu thuận tiện, thêm ảnh/video hoặc bản chép lời về hiện trạng.',
    )
    expect(derivePresentation({ chat: analysisChat(true) }).serverEvidenceRequired).toBe(true)
    expect(derivePresentation({ chat: analysisChat() }).serverEvidenceRequired).toBe(true)
  })

  it('renders intake confirmation before evidence and keeps the composer closed', () => {
    const chat = analysisChat(false)
    chat.session.next_action = 'confirm_intake'
    chat.session.intake_confirmation = {
      status: 'pending',
      blocking: false,
      fields: [],
    } as unknown as NonNullable<KaelChatResponse['session']['intake_confirmation']>

    const presentation = derivePresentation({ chat })

    expect(presentation.intakeConfirmationActive).toBe(true)
    expect(presentation.agenticEvidenceGateActive).toBe(false)
    expect(presentation.showComposer).toBe(false)
  })

  it('keeps the composer closed while the evidence card is submitting its drafts', () => {
    const chat = analysisChat(false)

    expect(derivePresentation({ chat }).showComposer).toBe(false)
    expect(derivePresentation({ chat, submittingAgenticEvidence: true }).showComposer).toBe(false)
  })

  it('uses the authoritative quote-ready phase instead of adding a second confidence threshold', () => {
    const chat = {
      session: {
        case_phase: 'offer_review',
        diagnosis_scope: {
          next_action: { kind: 'prepare_offer' },
          quote_blockers: [],
          quote_ready: true,
        },
        estimate: {
          confidence: 0.4,
          needs_inspection: false,
        },
        id: 'quote-ready-session',
        job_id: null,
        next_action: 'estimate_ready',
        service_type: 'plumbing',
        status: 'estimate_ready',
      },
      turns: [],
    } as unknown as KaelChatResponse

    expect(derivePresentation({ chat }).canConfirmAgenticEstimate).toBe(true)
  })

  it('replaces a persisted long handyman prompt with the compact localized copy', () => {
    const chat = {
      session: {
        case_phase: 'analysis',
        diagnosis_scope: {
          next_action: {
            evidence_kind: 'photo',
            kind: 'request_evidence',
            prompt: 'Bạn gửi một ảnh thấy rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước và dụng cụ cần chuẩn bị.',
            required: true,
          },
          quote_blockers: ['handyman_visual_evidence'],
        },
        id: 'handyman-session',
        service_type: 'handyman',
        status: 'collecting_evidence',
      },
      turns: [],
    } as unknown as KaelChatResponse

    expect(derivePresentation({ chat }).serverEvidencePrompt).toBe(
      'Gửi ảnh rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước, dụng cụ cần dùng.',
    )
  })

  it('does not mix legacy catalog replies into the authoritative Case Work transcript', () => {
    const presentation = derivePresentation({
      catalogTurns: [
        {
          conversation_id: 'catalog-a',
          created_at: '2026-07-18T00:00:00.000Z',
          id: 'legacy-customer',
          role: 'customer',
          text_content: 'Ở khách',
          turn_index: 1,
        },
        {
          conversation_id: 'catalog-a',
          created_at: '2026-07-18T00:00:01.000Z',
          id: 'legacy-kael',
          role: 'kael',
          text_content: 'Khu vực cần xử lý nằm chính xác ở đâu trong căn hộ?',
          turn_index: 2,
        },
      ],
      chat: analysisChat(false),
      turns: [
        {
          content_type: 'clarification',
          id: 'authoritative-kael',
          role: 'kael',
          text_content: 'Ổ cắm có vết cháy hoặc phát tia lửa không?',
        },
      ] as unknown as KaelChatTurn[],
    })

    expect(presentation.caseAssistantTurns).toEqual([])
    expect(presentation.agenticVisibleTurns).toEqual([
      expect.objectContaining({ id: 'authoritative-kael' }),
    ])
  })
})
