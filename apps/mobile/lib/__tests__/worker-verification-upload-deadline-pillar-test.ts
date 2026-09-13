const mockGetUser = jest.fn()
const mockUpload = jest.fn()
const mockRemove = jest.fn()

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
  },
}))

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { createClient } from '@supabase/supabase-js'
import { uploadWorkerVerificationDrafts } from '../worker-verification-upload'
import * as requestIds from '../client-request-id'

export const PILLAR = {
  id: 'P165-worker-verification-upload-deadline',
  invariant: 'Worker verification uploads and cleanup settle within bounded time without acknowledging unknown Storage outcomes',
  authority: ['governance/RULES.md #8', 'governance/RULES.md #10'],
  target: 'apps/mobile/lib/worker-verification-upload.ts',
  layer: 'security-negative',
  siblings: ['P163-worker-registration-draft-gate'],
  mutation: 'remove the Storage deadlines; a hanging upload or cleanup leaves the public upload promise pending',
} as const satisfies PillarManifest

const files = {
  cccdFront: { uri: 'file:///front.jpg', type: 'image' as const },
  cccdBack: { uri: 'file:///back.jpg', type: 'image' as const },
  selfie: { uri: 'file:///selfie.jpg', type: 'image' as const },
}

beforeEach(() => {
  jest.useFakeTimers()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'worker-fixture' } }, error: null })
  mockUpload.mockResolvedValue({ error: null })
  mockRemove.mockResolvedValue({ error: null })
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['fixture'], { type: 'image/jpeg' }),
  } as Response)
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
  jest.resetAllMocks()
})

it('refuses private files when auth resolves to a different account than the initiating form', async () => {
  const outcome = await uploadWorkerVerificationDrafts(files, 'original-worker')
  expect(outcome).toEqual(expect.objectContaining({ success: false, code: 'AUTH_CHANGED' }))
  expect(mockUpload).not.toHaveBeenCalled()
  expect(global.fetch).not.toHaveBeenCalled()
})

it('returns a bounded failure without cleaning paths whose Storage outcome is unknown', async () => {
  mockUpload.mockImplementation(() => new Promise(() => {}))
  mockRemove.mockImplementation(() => new Promise(() => {}))
  let outcome: Awaited<ReturnType<typeof uploadWorkerVerificationDrafts>> | undefined
  void uploadWorkerVerificationDrafts(files).then((result) => { outcome = result })
  await jest.advanceTimersByTimeAsync(120_001)
  withPillarContext(PILLAR, () => {
    expect(mockUpload).toHaveBeenCalledTimes(3)
    expect(outcome).toEqual(expect.objectContaining({ success: false, code: 'MEDIA_UPLOAD_FAILED' }))
    expect(mockRemove).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  }, 'hung private Storage must release the registration form without success')
})

it('bounds cleanup after a rejected upload and does not expose the Storage error', async () => {
  mockUpload.mockResolvedValueOnce({ error: { message: 'private-provider-detail' } })
  mockRemove.mockImplementation(() => new Promise(() => {}))
  let outcome: Awaited<ReturnType<typeof uploadWorkerVerificationDrafts>> | undefined
  void uploadWorkerVerificationDrafts(files).then((result) => { outcome = result })
  await jest.advanceTimersByTimeAsync(10_001)
  withPillarContext(PILLAR, () => {
    expect(outcome).toEqual(expect.objectContaining({ success: false, code: 'MEDIA_UPLOAD_FAILED' }))
    expect(JSON.stringify(outcome)).not.toContain('private-provider-detail')
    expect(mockRemove).toHaveBeenCalledWith(mockUpload.mock.calls.slice(1).map(([path]) => path))
    expect(jest.getTimerCount()).toBe(0)
  }, 'cleanup failure must not replace the upload failure with an indefinite wait')
})

it('never changes a timed-out outcome into success when Storage replies late', async () => {
  let resolveUpload!: (value: { error: null }) => void
  mockUpload.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve }))
  const completed = jest.fn()
  const pending = uploadWorkerVerificationDrafts(files).then(completed)
  await jest.advanceTimersByTimeAsync(75_001)
  resolveUpload({ error: null })
  await pending
  withPillarContext(PILLAR, () => {
    expect(completed).toHaveBeenCalledTimes(1)
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(mockUpload).toHaveBeenCalledTimes(3)
    expect(jest.getTimerCount()).toBe(0)
  }, 'late completion is not a new acknowledgement and must not trigger a retry')
})

it('returns owned private refs only after all three uploads acknowledge success', async () => {
  const outcome = await uploadWorkerVerificationDrafts(files)
  withPillarContext(PILLAR, () => {
    expect(outcome).toEqual({
      success: true,
      urls: {
        cccd_front_url: expect.stringMatching(/^supabase:\/\/worker-verification\/worker-fixture\/cccd-front\//),
        cccd_back_url: expect.stringMatching(/^supabase:\/\/worker-verification\/worker-fixture\/cccd-back\//),
        selfie_url: expect.stringMatching(/^supabase:\/\/worker-verification\/worker-fixture\/selfie\//),
      },
    })
    expect(mockUpload).toHaveBeenCalledTimes(3)
    expect(mockRemove).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  }, 'normal Storage acknowledgements preserve the existing private media contract')
})

it('uploads only selected replacements and never returns refs for omitted documents', async () => {
  const outcome = await uploadWorkerVerificationDrafts({ cccdBack: files.cccdBack }, 'worker-fixture')
  withPillarContext(PILLAR, () => {
    expect(outcome).toEqual({ success: true, urls: {
      cccd_back_url: expect.stringMatching(/^supabase:\/\/worker-verification\/worker-fixture\/cccd-back\//),
    } })
    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockRemove).not.toHaveBeenCalled()
  }, 'partial replacement must not read, upload or clear server-owned documents that were not selected')
})

it('refuses an empty upload instead of acknowledging a document save', async () => {
  const outcome = await uploadWorkerVerificationDrafts({}, 'worker-fixture')
  expect(outcome).toMatchObject({ success: false, code: 'MEDIA_REQUIRED' })
  expect(mockUpload).not.toHaveBeenCalled()
  expect(global.fetch).not.toHaveBeenCalled()
})

it('isolates cleanup from a successful upload made in the same clock tick', async () => {
  await uploadWorkerVerificationDrafts({ cccdBack: files.cccdBack }, 'worker-fixture')
  const firstPath = mockUpload.mock.calls[0][0]
  mockUpload.mockResolvedValueOnce({ error: { message: 'upload failed' } })
  const result = await uploadWorkerVerificationDrafts({ cccdBack: files.cccdBack }, 'worker-fixture')
  expect(result.success).toBe(false)
  withPillarContext(PILLAR, () => {
    expect(mockUpload.mock.calls[1][0]).not.toBe(firstPath)
    expect(mockRemove.mock.calls.flatMap(([paths]) => paths)).not.toContain(firstPath)
  }, 'a failed retry must never remove the private object acknowledged by an earlier upload')
})

it('never removes an unacknowledged path after a Storage object conflict', async () => {
  jest.spyOn(requestIds, 'generateClientRequestId').mockReturnValue('d7200000-0000-4000-8000-000000000001')
  await uploadWorkerVerificationDrafts({ cccdBack: files.cccdBack }, 'worker-fixture')
  mockUpload.mockResolvedValueOnce({ error: { statusCode: '409', error: 'Duplicate' } })
  const result = await uploadWorkerVerificationDrafts({ cccdBack: files.cccdBack }, 'worker-fixture')
  expect(result.success).toBe(false)
  expect(mockRemove).not.toHaveBeenCalled()
})

it('bounds the real Storage SDK when response headers arrive but JSON never settles', async () => {
  const readJson = jest.fn(() => new Promise(() => {}))
  const response = new Response(null, { status: 200 })
  response.json = readJson
  const storageFetch = jest.fn(async () => response)
  const bucket = createClient('https://storage-fixture.invalid', 'public-test-key', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: storageFetch },
  }).storage.from('worker-verification')
  mockUpload.mockImplementation((...args: Parameters<typeof bucket.upload>) => bucket.upload(...args))
  let outcome: Awaited<ReturnType<typeof uploadWorkerVerificationDrafts>> | undefined
  void uploadWorkerVerificationDrafts(files).then((result) => { outcome = result })
  await jest.advanceTimersByTimeAsync(65_001)
  expect(readJson).toHaveBeenCalledTimes(3)
  expect(outcome).toBeUndefined()
  await jest.advanceTimersByTimeAsync(10_000)
  withPillarContext(PILLAR, () => {
    expect(outcome).toEqual(expect.objectContaining({ success: false, code: 'MEDIA_UPLOAD_FAILED' }))
    expect(mockRemove).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  }, 'the fetch deadline cannot bound SDK body parsing after fetch has already returned')
})
