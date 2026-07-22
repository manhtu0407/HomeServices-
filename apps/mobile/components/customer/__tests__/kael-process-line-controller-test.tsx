import { act, renderHook } from '@testing-library/react-native'

import {
  KAEL_COMPOSER_REPLY_REVEAL_MS,
  useKaelProcessLineController,
} from '../v21/use-kael-process-line-controller'

describe('customer Kael process-line controller', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
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
