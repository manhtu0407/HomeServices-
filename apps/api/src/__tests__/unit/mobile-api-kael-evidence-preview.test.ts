import { describe, expect, it } from 'vitest'

import {
  kaelEvidencePreviewCandidates,
  pairKaelEvidencePreviewUrls,
} from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-evidence-preview'

describe('mobile-api Kael evidence previews', () => {
  it('preserves photo and video-frame numbering while excluding private originals', () => {
    const candidates = kaelEvidencePreviewCandidates([
      { kind: 'photo', model_eligible: true, ref: 'supabase://kael-chat-media/customer/model_vision/photo-1.jpg' },
      { kind: 'video_original_private', model_eligible: false, ref: 'supabase://kael-chat-media/customer/private_original/video.mov' },
      { kind: 'video_frame', model_eligible: true, ref: 'supabase://kael-chat-media/customer/model_vision/frame-1.jpg' },
      { kind: 'photo', model_eligible: true, ref: 'supabase://kael-chat-media/customer/model_vision/photo-2.jpg' },
    ])

    expect(pairKaelEvidencePreviewUrls(candidates, [
      'https://media.test/photo-1',
      'https://media.test/frame-1',
      'https://media.test/photo-2',
    ])).toEqual([
      { evidence_index: 1, evidence_kind: 'photo', url: 'https://media.test/photo-1' },
      { evidence_index: 1, evidence_kind: 'video_frame', url: 'https://media.test/frame-1' },
      { evidence_index: 2, evidence_kind: 'photo', url: 'https://media.test/photo-2' },
    ])
  })

  it('returns no previews rather than pairing a URL with the wrong image', () => {
    const candidates = kaelEvidencePreviewCandidates([
      { kind: 'photo', model_eligible: true, ref: 'one' },
      { kind: 'photo', model_eligible: true, ref: 'two' },
    ])

    expect(pairKaelEvidencePreviewUrls(candidates, ['https://media.test/only-one'])).toEqual([])
  })
})
