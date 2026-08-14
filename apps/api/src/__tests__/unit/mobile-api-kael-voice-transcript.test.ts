import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildVoiceTranscriptRow,
  scrubTranscriptForStorage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/tools/voice-transcript'

const kaelChatService = ['create.ts', 'turn.ts', 'evidence.ts'].map((path) => readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat', path),
  'utf8',
)).join('\n')
const kaelChatPersistence = readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/persistence.service.ts'),
  'utf8',
)

describe('KC7 voice transcript store (Plan.md §39)', () => {
  it('scrubs phone and address out of a transcript before storage', () => {
    const result = scrubTranscriptForStorage('Nhà em ở tầng 12 Vinhomes, gọi 0901234567 giúp nha')
    expect(result.ok).toBe(true)
    expect(result.scrubbed).not.toContain('0901234567')
    expect(result.scrubbed).toContain('[phone]')
    expect(result.scrubbed).toContain('[floor]')
  })

  it('refuses to store a transcript that still carries raw PII or is empty', () => {
    // Empty after trim -> not storable.
    expect(scrubTranscriptForStorage('    ').ok).toBe(false)
    // A long account-like digit run is scrubbed before the residual guard.
    const forced = scrubTranscriptForStorage('so tai khoan 1234567890123456789')
    expect(forced.ok).toBe(true)
    expect(forced.scrubbed).toContain('[bank-account]')
    expect(forced.scrubbed).not.toContain('1234567890123456789')
  })

  it('buildVoiceTranscriptRow drops unstorable transcripts and defaults to on-device STT', () => {
    expect(buildVoiceTranscriptRow({ userId: 'u1', text: '   ' })).toBeNull()
    const row = buildVoiceTranscriptRow({ userId: 'u1', text: 'Cái vòi nước bị hư nha' })
    expect(row).not.toBeNull()
    expect(row?.source).toBe('on_device_stt')
    expect(row?.region_hint).toBe('unknown')
    expect(row?.user_id).toBe('u1')
    expect(row?.scrubbed_text.length ?? 0).toBeGreaterThan(0)
    expect(row?.scrubbed_text).not.toContain('[phone]')
  })

  it('persists reviewed transcripts from create, turn, and evidence flows without an audio payload', () => {
    expect(kaelChatService).toContain('from "./persistence.service.ts"')
    expect(kaelChatPersistence.match(/await persistInitialVoiceTranscripts\(/g)).toHaveLength(1)
    expect(kaelChatService.match(/await persistReviewedVoiceTranscripts\(/g)).toHaveLength(2)
    expect(kaelChatPersistence).toContain('import { buildVoiceTranscriptRow } from "../../kael/tools/voice-transcript.ts"')
    expect(kaelChatPersistence).toContain('.from("kael_voice_transcript")')
    expect(kaelChatPersistence).toContain('buildVoiceTranscriptRow({')
    expect(kaelChatPersistence).toContain('.insert(rows)')
    expect(kaelChatPersistence).toContain('scrubbed_text')
    expect(kaelChatPersistence).not.toMatch(/audio_(?:url|ref|bytes)|raw_audio|recording/i)
  })
})
