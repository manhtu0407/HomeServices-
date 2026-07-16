import { act, renderHook } from '@testing-library/react-native'

import { useKaelProcessLineController } from '../v21/use-kael-process-line-controller'

describe('customer Kael process-line controller', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
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
