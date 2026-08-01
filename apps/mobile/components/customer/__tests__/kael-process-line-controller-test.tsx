import { act, render, renderHook, screen } from '@testing-library/react-native'

import type { KaelChatProgress } from '@/lib/api-types'

import {
  KAEL_COMPOSER_REPLY_REVEAL_MS,
  KAEL_EVIDENCE_RESULT_SETTLE_MS,
  useKaelProcessLineController,
} from '../kael-chat/use-kael-process-line-controller'
import { KaelProcessLines } from '../kael-chat/kael-process-line-view'

describe('customer Kael process-line controller', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('keeps a clear gap around process lines so they do not crowd the chat text', () => {
    render(
      <KaelProcessLines
        state={{
          activeIndex: 0,
          collapse: null,
          lines: [{ durationMs: 0, key: 'evidence', stage: 'observe', status: 'running', text: 'Kael đang kiểm tra ảnh.' }],
          prompt: 'Kiểm tra giúp tôi ảnh này.',
          scenarioId: 'evidence_check',
          visibleCount: 1,
        }}
      />,
    )

    expect(screen.getByTestId('customer-v21-kael-process-lines')).toHaveStyle({
      marginBottom: 10,
      marginLeft: 8,
      marginTop: 10,
    })
  })

  it('keeps non-composer actions free from an artificial response delay', async () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: 'electrical',
    }))

    let visualReady!: Promise<void>
    act(() => {
      visualReady = result.current.startProcessLines('Ổ cắm ở phòng khách bị hỏng', {
        mediaCount: 0,
        mode: 'case',
        serviceType: 'electrical',
      })
    })
    let settled = false
    void visualReady.then(() => {
      settled = true
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(settled).toBe(true)
    expect(result.current.processLines).not.toBeNull()
    act(() => result.current.stopProcessLines())
  })

  it('applies one short reveal window only to a composer message', async () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: 'electrical',
    }))

    let replyReveal!: Promise<void>
    act(() => {
      replyReveal = result.current.startProcessLines('Ổ cắm ở tầng 37, trong phòng khách', {
        mediaCount: 0,
        mode: 'case',
        replyReveal: 'composer_message',
        serviceType: 'electrical',
      })
    })
    let settled = false
    void replyReveal.then(() => {
      settled = true
    })

    await act(async () => {
      jest.advanceTimersByTime(KAEL_COMPOSER_REPLY_REVEAL_MS - 1)
      await Promise.resolve()
    })
    expect(settled).toBe(false)

    await act(async () => {
      jest.advanceTimersByTime(1)
      await replyReveal
    })
    expect(settled).toBe(true)
  })

  it('uses actual evidence progress instead of advancing evidence lines on a timer', () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: 'plumbing',
    }))

    act(() => {
      result.current.startEvidenceProcessLines({
        hasVideo: true,
        hasVoiceTranscript: true,
        serviceType: 'plumbing',
      })
      jest.advanceTimersByTime(10_000)
    })

    expect(result.current.processLines?.scenarioId).toBe('evidence_check')
    expect(result.current.processLines?.lines).toHaveLength(1)
    expect(result.current.processLines?.lines[0]).toMatchObject({
      status: 'running',
      text: 'Đang chuẩn bị bằng chứng để gửi riêng tư.',
    })

    const progress: KaelChatProgress = {
      current_stage: 'vision_analysis',
      status: 'running',
      progress: 0.4,
      updated_at: '2026-07-27T04:00:00.000Z',
    }
    act(() => result.current.updateEvidenceProcessProgress(progress))

    expect(result.current.processLines?.lines).toMatchObject([
      { status: 'completed', text: 'Đang chuẩn bị bằng chứng để gửi riêng tư.' },
      {
        status: 'running',
        text: 'Kael đang kiểm tra các khung hình đã tách từ video.',
      },
    ])
  })

  it('does not claim a voice transcript when this evidence submission has none', () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'en',
      selectedService: 'plumbing',
    }))

    act(() => {
      result.current.startEvidenceProcessLines({ serviceType: 'plumbing' })
      result.current.updateEvidenceProcessProgress({
        current_stage: 'vision_analysis',
        status: 'completed',
        progress: 0.4,
        updated_at: '2026-07-27T04:00:00.000Z',
      })
    })

    expect(result.current.processLines?.lines.at(-1)).toMatchObject({
      status: 'completed',
      text: 'Kael recorded that no evidence was included this time.',
    })
  })

  it('shows a short authoritative completion transition before opening the estimate', async () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: 'plumbing',
    }))
    act(() => {
      result.current.startEvidenceProcessLines({ hasImage: true, serviceType: 'plumbing' })
      result.current.updateEvidenceProcessProgress({
        current_stage: 'price_synthesis',
        status: 'completed',
        progress: 1,
        updated_at: '2026-07-27T04:00:00.000Z',
      })
    })

    let settled = false
    let settlePromise!: Promise<void>
    act(() => {
      settlePromise = result.current.settleEvidenceProcessLines()
      void settlePromise.then(() => {
        settled = true
      })
    })
    expect(result.current.processLines).toMatchObject({
      activeIndex: null,
      collapse: 'Kael đã hoàn tất đối chiếu. Đang mở cơ sở giá.',
    })

    await act(async () => {
      jest.advanceTimersByTime(KAEL_EVIDENCE_RESULT_SETTLE_MS - 1)
      await Promise.resolve()
    })
    expect(settled).toBe(false)

    await act(async () => {
      jest.advanceTimersByTime(1)
      await settlePromise
    })
    expect(settled).toBe(true)
  })

  it('does not mistake a request for Vietnamese wording for a payment question', () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: null,
    }))

    act(() => {
      void result.current.startProcessLines('Hãy trả lời ngắn gọn bằng tiếng Việt', {
        mediaCount: 0,
        mode: 'normal',
      })
    })

    expect(result.current.processLines?.scenarioId).toBe('normal_chat')
    expect(result.current.processLines?.lines[0]?.text).toBe('Kael đang hiểu mục tiêu bạn vừa hỏi…')
  })

  it('does not mistake máy lạnh for an image attachment', () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: 'hvac',
    }))

    act(() => {
      void result.current.startProcessLines('Máy lạnh chỉ nhỏ nước khi chạy lâu', {
        mediaCount: 0,
        mode: 'normal',
        serviceType: 'hvac',
      })
    })

    expect(result.current.processLines?.scenarioId).toBe('normal_chat')
    expect(result.current.processLines?.lines[0]?.text).toBe('Kael đang hiểu mục tiêu bạn vừa hỏi…')
  })

  it('settles an interrupted run and prevents its timers from updating the next run', async () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'en',
      selectedService: 'plumbing',
    }))

    let interrupted: Promise<void>
    act(() => {
      interrupted = result.current.startProcessLines('Check the leaking pipe', {
        mediaCount: 0,
        mode: 'normal',
        serviceType: 'plumbing',
      })
    })
    expect(result.current.processLines?.prompt).toBe('Check the leaking pipe')

    act(() => {
      result.current.stopProcessLines()
    })
    await expect(interrupted!).resolves.toBeUndefined()
    expect(result.current.processLines).toBeNull()

    act(() => {
      void result.current.startProcessLines('Check the breaker', {
        mediaCount: 0,
        mode: 'normal',
        serviceType: 'electrical',
      })
      jest.runAllTimers()
    })

    expect(result.current.processLines?.prompt).toBe('Check the breaker')
  })
})
