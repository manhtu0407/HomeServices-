import { afterEach, describe, expect, it, vi } from 'vitest'

const lookupMock = vi.hoisted(() => vi.fn())

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }))

import { fetchTrustedPublicUrl } from '../../../../../scripts/lib/research-network-safety.mjs'

afterEach(() => {
  lookupMock.mockReset()
  vi.unstubAllGlobals()
})

describe('source research DNS safety', () => {
  it.each([
    '::ffff:7f00:1',
    '::ffff:a00:1',
  ])('rejects private IPv4-mapped IPv6 in hexadecimal form: %s', async (address) => {
    lookupMock.mockResolvedValue([{ address, family: 6 }])
    const fetchMock = vi.fn(async () => new Response('private response'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchTrustedPublicUrl('https://source.example/report')).rejects.toThrow(
      'public addresses',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
