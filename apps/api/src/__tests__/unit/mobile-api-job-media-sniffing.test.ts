import { describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import {
  inspectJobMediaBlob,
  inspectJobMediaContent,
} from '../../../../../supabase/functions/mobile-api/_shared/services/job-media-content'
import { attachJobMedia } from '../../../../../supabase/functions/mobile-api/_shared/services/job-media.service'

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }
type QueryCall = { operations: unknown[][]; table: string }
type StorageCall = { bucket: string; operation: 'download' | 'remove'; paths: string[] }

const JOB_ID = '11111111-1111-1111-1111-111111111111'

describe('job media Storage byte verification', () => {
  it.each([
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])],
    ['image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/webp', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
  ] as const)('accepts trusted %s magic bytes', (mimeType, bytes) => {
    expect(inspectJobMediaContent(bytes)).toEqual({ kind: 'trusted', mimeType })
  })

  it('accepts MP4 only when the ISO container has a video handler', () => {
    expect(inspectJobMediaContent(mp4WithHandler('vide'))).toEqual({
      kind: 'trusted',
      mimeType: 'video/mp4',
    })
    expect(inspectJobMediaContent(mp4WithHandler('soun'))).toEqual({
      kind: 'audio',
      mimeType: null,
    })
    expect(inspectJobMediaContent(mp4FtypOnly())).toEqual({
      kind: 'unsupported',
      mimeType: null,
    })
  })

  it('sniffs a stored object through bounded Blob slices instead of a whole-file copy', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])
    const wholeFileRead = vi.fn(() => {
      throw new Error('whole-file reads are forbidden')
    })
    const slice = vi.fn((start?: number, end?: number) =>
      new Blob([bytes.slice(start ?? 0, end ?? bytes.length)]))
    const blob = {
      size: bytes.byteLength,
      slice,
      arrayBuffer: wholeFileRead,
    } as unknown as Blob

    await expect(inspectJobMediaBlob(blob)).resolves.toEqual({
      kind: 'trusted',
      mimeType: 'image/jpeg',
    })
    expect(wholeFileRead).not.toHaveBeenCalled()
    expect(slice).toHaveBeenCalledWith(0, bytes.byteLength)
  })

  it('rejects audio bytes disguised as a JPEG before durable insert and removes the object', async () => {
    const objectPath = `${JOB_ID}/before/fake-audio.jpg`
    const audioBytes = new TextEncoder().encode('ID3\u0004\u0000\u0000audio payload')
    const client = makeMediaClient({
      blob: new Blob([audioBytes], { type: 'image/jpeg' }),
      results: successfulAttachResults(),
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(attachJobMedia(ctx, JOB_ID, {
      assets: [{
        file_size_bytes: audioBytes.byteLength,
        mime_type: 'image/jpeg',
        object_path: objectPath,
        stage: 'before',
      }],
    })).rejects.toMatchObject({ code: 'RAW_AUDIO_PRIVATE', status: 400 })

    expect(client.storageCalls).toContainEqual({
      bucket: 'job-media',
      operation: 'remove',
      paths: [objectPath],
    })
    expect(client.calls.some((call) =>
      call.table === 'job_media_assets' && call.operations.some((operation) => operation[0] === 'insert')
    )).toBe(false)
  })

  it('rejects a valid MP4 at an image-only completion stage before durable insert', async () => {
    const objectPath = `${JOB_ID}/after/evidence.mp4`
    const mp4Bytes = mp4WithHandler('vide')
    const client = makeMediaClient({
      blob: new Blob([mp4Bytes], { type: 'video/mp4' }),
      results: successfulAttachResults({
        customer_id: 'customer-1',
        status: 'repairing',
        worker_id: 'worker-1',
      }),
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(attachJobMedia(ctx, JOB_ID, {
      assets: [{
        file_size_bytes: mp4Bytes.byteLength,
        mime_type: 'video/mp4',
        object_path: objectPath,
        stage: 'after',
      }],
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA', status: 400 })

    expect(client.storageCalls).toContainEqual({
      bucket: 'job-media',
      operation: 'remove',
      paths: [objectPath],
    })
    expect(client.calls.some((call) =>
      call.table === 'job_media_assets' && call.operations.some((operation) => operation[0] === 'insert')
    )).toBe(false)
  })

  it('fails closed when the declared byte count differs from the downloaded object', async () => {
    const objectPath = `${JOB_ID}/before/size-mismatch.jpg`
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])
    const client = makeMediaClient({
      blob: new Blob([jpegBytes], { type: 'image/jpeg' }),
      results: successfulAttachResults(),
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(attachJobMedia(ctx, JOB_ID, {
      assets: [{
        file_size_bytes: jpegBytes.byteLength + 1,
        mime_type: 'image/jpeg',
        object_path: objectPath,
        stage: 'before',
      }],
    })).rejects.toMatchObject({ code: 'MEDIA_SIZE_MISMATCH', status: 400 })

    expect(client.storageCalls).toContainEqual({
      bucket: 'job-media',
      operation: 'remove',
      paths: [objectPath],
    })
    expect(client.calls.some((call) =>
      call.table === 'job_media_assets' && call.operations.some((operation) => operation[0] === 'insert')
    )).toBe(false)
  })

  it('fails closed when the declared MIME differs from the downloaded bytes', async () => {
    const objectPath = `${JOB_ID}/before/mismatched.jpg`
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const client = makeMediaClient({
      blob: new Blob([pngBytes], { type: 'image/jpeg' }),
      results: successfulAttachResults(),
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(attachJobMedia(ctx, JOB_ID, {
      assets: [{
        file_size_bytes: pngBytes.byteLength,
        mime_type: 'image/jpeg',
        object_path: objectPath,
        stage: 'before',
      }],
    })).rejects.toMatchObject({ code: 'MEDIA_TYPE_MISMATCH', status: 400 })

    expect(client.storageCalls).toContainEqual({
      bucket: 'job-media',
      operation: 'remove',
      paths: [objectPath],
    })
    expect(client.calls.some((call) =>
      call.table === 'job_media_assets' && call.operations.some((operation) => operation[0] === 'insert')
    )).toBe(false)
  })

  it('does not delete an object when a concurrent attach already made it durable', async () => {
    const objectPath = `${JOB_ID}/before/concurrent.jpg`
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])
    const results = successfulAttachResults()
    results[2] = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const client = makeMediaClient({
      blob: new Blob([jpegBytes], { type: 'image/jpeg' }),
      results,
      revokedPaths: [],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(attachJobMedia(ctx, JOB_ID, {
      assets: [{
        file_size_bytes: jpegBytes.byteLength,
        mime_type: 'image/jpeg',
        object_path: objectPath,
        stage: 'before',
      }],
    })).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    expect(client.storageCalls).not.toContainEqual({
      bucket: 'job-media',
      operation: 'remove',
      paths: [objectPath],
    })
  })
})

function successfulAttachResults(jobOverrides: Record<string, unknown> = {}): QueryResult[] {
  return [
    {
      data: {
        completion_photo_urls: [],
        customer_id: 'customer-1',
        id: JOB_ID,
        photo_urls: [],
        service_type: 'electrical',
        status: 'awaiting_customer_confirm',
        worker_id: null,
        ...jobOverrides,
      },
      error: null,
    },
    { data: [], error: null },
    { data: [{ id: 'asset-1' }], error: null },
    { data: { id: JOB_ID }, error: null },
    { data: null, error: null },
  ]
}

function mp4WithHandler(handler: 'soun' | 'vide') {
  const ftyp = mp4FtypOnly()
  const hdlr = isoBox('hdlr', concatBytes(new Uint8Array(8), asciiBytes(handler), new Uint8Array(12)))
  const mdia = isoBox('mdia', hdlr)
  const trak = isoBox('trak', mdia)
  const moov = isoBox('moov', trak)
  return concatBytes(ftyp, moov)
}

function mp4FtypOnly() {
  return isoBox('ftyp', concatBytes(asciiBytes('isom'), new Uint8Array(4), asciiBytes('isommp42')))
}

function isoBox(type: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.byteLength)
  new DataView(bytes.buffer).setUint32(0, bytes.byteLength)
  bytes.set(asciiBytes(type), 4)
  bytes.set(payload, 8)
  return bytes
}

function asciiBytes(value: string) {
  return new TextEncoder().encode(value)
}

function concatBytes(...parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

function makeMediaClient({
  blob,
  results,
  revokedPaths,
}: {
  blob: Blob
  results: QueryResult[]
  revokedPaths?: string[]
}) {
  const calls: QueryCall[] = []
  const storageCalls: StorageCall[] = []
  return {
    calls,
    storageCalls,
    from(table: string) {
      const call: QueryCall = { operations: [], table }
      calls.push(call)
      return makeQuery(call, results)
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name === 'consume_job_media_uploads') {
        const paths = Array.isArray(args.p_object_paths) ? args.p_object_paths : []
        return Promise.resolve({
          data: [{ consumed_count: paths.length, ok: true, reason: null }],
          error: null,
        })
      }
      if (name === 'fail_job_media_uploads') {
        const requestedPaths = Array.isArray(args.p_object_paths) ? args.p_object_paths : []
        const paths = revokedPaths ?? requestedPaths
        return Promise.resolve({
          data: [{
            ok: paths.length === requestedPaths.length,
            reason: paths.length === requestedPaths.length ? null : 'MEDIA_INTENT_STATE_CHANGED',
            revoked_paths: paths,
          }],
          error: null,
        })
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            storageCalls.push({ bucket, operation: 'download', paths: [path] })
            return { data: blob, error: null }
          },
          async remove(paths: string[]) {
            storageCalls.push({ bucket, operation: 'remove', paths })
            return { data: paths.map((name) => ({ name })), error: null }
          },
        }
      },
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string) {
      call.operations.push(['select', columns])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    update(value: unknown) {
      call.operations.push(['update', value])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    in(column: string, values: unknown[]) {
      call.operations.push(['in', column, values])
      return query
    },
    single() {
      call.operations.push(['single'])
      return query
    },
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(results.shift() ?? { data: null, error: { message: 'unexpected query' } }).then(onfulfilled, onrejected)
    },
  }
  return query
}
