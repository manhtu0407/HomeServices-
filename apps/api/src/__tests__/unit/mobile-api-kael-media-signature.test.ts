import { describe, expect, it } from 'vitest'

import {
  buildKaelVisionValidationEvidence,
  inspectTrustedKaelVisionTransform,
  isTrustedKaelVisionTransformPayload,
} from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-media.service'

describe('Kael trusted model-vision transform gate', () => {
  it('adds every legacy model_vision ref to the validation set exactly once', () => {
    const ownerId = 'a2100000-0000-4000-8000-000000000001'
    const typedRef = `supabase://kael-chat-media/${ownerId}/kael-chat/model_vision/typed.jpg`
    const legacyRef = `supabase://kael-chat-media/${ownerId}/kael-chat/model_vision/legacy.jpg`
    const disabledTypedRef =
      `supabase://kael-chat-media/${ownerId}/kael-chat/model_vision/disabled.jpg`
    const privateVideoRef =
      `supabase://kael-chat-media/${ownerId}/kael-chat/private_video_original/original.mp4`

    expect(buildKaelVisionValidationEvidence(
      [
        { kind: 'video_frame', ref: typedRef, model_eligible: true },
        { kind: 'photo', ref: disabledTypedRef, model_eligible: false },
      ],
      [legacyRef, typedRef, disabledTypedRef, privateVideoRef],
    )).toEqual([
      { kind: 'video_frame', ref: typedRef, model_eligible: true },
      { kind: 'photo', ref: disabledTypedRef, model_eligible: false },
      { kind: 'photo', ref: legacyRef, model_eligible: true },
      { kind: 'photo', ref: disabledTypedRef, model_eligible: true },
    ])
  })

  it.each([
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ['image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/webp', new TextEncoder().encode('RIFF0000WEBP')],
  ])('accepts a decoded Storage transform payload for %s', (contentType, bytes) => {
    expect(isTrustedKaelVisionTransformPayload(contentType as string, bytes as Uint8Array)).toBe(true)
  })

  it.each([
    ['audio/mpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ['image/jpeg', new TextEncoder().encode('ID3 audio!!!')],
    ['image/gif', new TextEncoder().encode('GIF89a000000')],
    ['image/heic', new Uint8Array([0, 0, 0, 0, ...new TextEncoder().encode('ftypheic')])],
  ])('rejects non-transform or unsupported payloads', (contentType, bytes) => {
    expect(isTrustedKaelVisionTransformPayload(contentType as string, bytes as Uint8Array)).toBe(false)
  })

  it('rejects a JPEG-prefix polyglot when the trusted decoder refuses the source', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('invalid source', {
      headers: { 'content-type': 'application/json' },
      status: 422,
    })
    try {
      await expect(inspectTrustedKaelVisionTransform('https://storage.test/transform')).resolves.toBe('invalid')
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
