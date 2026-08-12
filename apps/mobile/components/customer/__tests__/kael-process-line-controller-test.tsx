import { act, render, renderHook, screen } from '@testing-library/react-native'

import type { KaelChatProgress } from '@/lib/api-types'

import {
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
          origin: 'backend',
          prompt: 'Kiểm tra giúp tôi ảnh này.',
          scenarioId: 'evidence_check',
          streamId: 'evidence:test',
          visibleCount: 1,
        }}
      />,
    )

    expect(screen.getByTestId('customer-v21-kael-process-lines')).toHaveStyle({
      marginBottom: 10,
      marginLeft: 8,
      marginTop: 10,
    })
    expect(screen.queryByText('Kael đang kiểm tra ảnh.')).toBeNull()
    act(() => jest.advanceTimersByTime(48))
    expect(screen.getByText('Kael đang kiểm tra ảnh.')).toBeTruthy()
  })

  it('does not invent a local reasoning trail for a non-streaming action', async () => {
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
    expect(result.current.processLines).toBeNull()
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
    expect(result.current.processLines?.lines).toHaveLength(0)

    const progress: KaelChatProgress = {
      current_stage: 'vision_analysis',
      status: 'running',
      progress: 0.4,
      updated_at: '2026-07-27T04:00:00.000Z',
    }
    act(() => result.current.updateEvidenceProcessProgress(progress))

    expect(result.current.processLines?.lines).toMatchObject([
      {
        status: 'running',
        text: 'Kael đang kiểm tra các khung hình đã tách từ video.',
      },
    ])
  })

  it('adds agentic process lines only when the Backend emits a stage', () => {
    const { result } = renderHook(() => useKaelProcessLineController({
      caseServiceLabel: null,
      deal: null,
      language: 'vi',
      selectedService: 'plumbing',
    }))

    act(() => {
      result.current.startBackendProcessLines()
      jest.advanceTimersByTime(10_000)
    })
    expect(result.current.processLines).toMatchObject({
      lines: [],
      origin: 'backend',
    })

    act(() => result.current.updateBackendProcessProgress({
      current_stage: 'market_lookup',
      progress: 0.5,
      status: 'running',
      updated_at: '2026-08-11T04:00:00.000Z',
    }))

    expect(result.current.processLines?.lines).toMatchObject([{
      status: 'running',
      text: 'Kael đang đối chiếu dữ liệu giá theo khu vực.',
    }])
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

})
