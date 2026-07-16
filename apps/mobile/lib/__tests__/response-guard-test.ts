import {
  ResponseBodyInvalidEncodingError,
  ResponseBodyTooLargeError,
  readResponseBlobBounded,
  readResponseTextBounded,
  withNetworkDeadline,
} from '../response-guard'

function responseStub(input: {
  blob?: jest.Mock
  contentLength?: string | null
  text?: jest.Mock
}) {
  return {
    blob: input.blob ?? jest.fn(async () => new Blob()),
    body: null,
    headers: { get: () => input.contentLength ?? null },
    text: input.text ?? jest.fn(async () => ''),
  } as unknown as Response
}

describe('mobile response body guard', () => {
  it('rejects a declared oversized blob before buffering it', async () => {
    const blob = jest.fn(async () => new Blob(['unreachable']))
    const response = responseStub({ blob, contentLength: '101' })

    await expect(readResponseBlobBounded(response, 100)).rejects
      .toBeInstanceOf(ResponseBodyTooLargeError)
    expect(blob).not.toHaveBeenCalled()
  })

  it('rejects a text body whose encoded bytes exceed the limit', async () => {
    const response = responseStub({ text: jest.fn(async () => '123456') })

    await expect(readResponseTextBounded(response, 5)).rejects
      .toBeInstanceOf(ResponseBodyTooLargeError)
  })

  it('rejects invalid UTF-8 bytes instead of decoding replacement characters', async () => {
    let readCount = 0
    const response = {
      body: {
        getReader: () => ({
          cancel: jest.fn(async () => undefined),
          read: jest.fn(async () => readCount++ === 0
            ? { done: false, value: new Uint8Array([0xc3, 0x28]) }
            : { done: true, value: undefined }),
          releaseLock: jest.fn(),
        }),
      },
      headers: { get: () => null },
    } as unknown as Response

    await expect(readResponseTextBounded(response, 16)).rejects
      .toBeInstanceOf(ResponseBodyInvalidEncodingError)
  })

  it('settles at the deadline even when the operation ignores abort signals', async () => {
    jest.useFakeTimers()
    const pending = withNetworkDeadline(
      async () => new Promise<never>(() => undefined),
      100,
    )
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'NETWORK_TIMEOUT',
    })

    await jest.advanceTimersByTimeAsync(100)

    await assertion
    jest.useRealTimers()
  })

  it('does not start an operation after the caller already aborted', async () => {
    const caller = new AbortController()
    caller.abort()
    const operation = jest.fn(async () => 'unreachable')

    await expect(withNetworkDeadline(operation, 100, caller.signal)).rejects
      .toMatchObject({ name: 'AbortError' })
    expect(operation).not.toHaveBeenCalled()
  })
})
