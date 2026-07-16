import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { useCustomerMessageMemoryPreference } from '../v21/use-customer-message-memory-preference'

type PreferenceHook = ReturnType<typeof useCustomerMessageMemoryPreference>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('customer message-memory preference ownership', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('ignores an earlier account response after the signed-in customer changes', async () => {
    const firstUpdate = deferred<boolean>()
    const updatePreference = jest.fn(() => firstUpdate.promise)
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const { result, rerender } = renderHook<PreferenceHook, { ownerId: string }>(
      ({ ownerId }) => useCustomerMessageMemoryPreference({
        accessToken: `token-${ownerId}`,
        backendEnabled: false,
        language: 'vi',
        ownerId,
        updatePreference,
      }),
      { initialProps: { ownerId: 'customer-a' } },
    )
    let pendingUpdate!: Promise<void>

    act(() => {
      pendingUpdate = result.current.toggle()
    })
    await waitFor(() => expect(result.current.pending).toBe(true))

    rerender({ ownerId: 'customer-b' })

    expect(result.current.enabled).toBe(false)
    expect(result.current.pending).toBe(false)

    await act(async () => {
      firstUpdate.resolve(false)
      await pendingUpdate
    })

    expect(result.current.enabled).toBe(false)
    expect(result.current.pending).toBe(false)
    expect(alert).not.toHaveBeenCalled()
  })

  it('starts only one preference update when toggled twice in one render', async () => {
    const pendingUpdate = deferred<boolean>()
    const updatePreference = jest.fn(() => pendingUpdate.promise)
    const { result } = renderHook(() => useCustomerMessageMemoryPreference({
      accessToken: 'token-customer-a',
      backendEnabled: false,
      language: 'vi',
      ownerId: 'customer-a',
      updatePreference,
    }))

    let firstToggle!: Promise<void>
    let secondToggle!: Promise<void>
    act(() => {
      firstToggle = result.current.toggle()
      secondToggle = result.current.toggle()
    })

    expect(updatePreference).toHaveBeenCalledTimes(1)
    await act(async () => {
      pendingUpdate.resolve(true)
      await Promise.all([firstToggle, secondToggle])
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.enabled).toBe(true)
  })
})
