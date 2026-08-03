import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildVoiceTranscriptRow,
  scrubTranscriptForStorage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/tools/voice-transcript'

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations')
const migration = readdirSync(migrationsDir)
  .filter((name) => name.includes('kael_voice_transcript'))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
  .join('\n')
const kaelChatService = ['create.ts', 'turn.ts', 'evidence.ts'].map((path) => readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat', path),
  'utf8',
)).join('\n')
const kaelChatPersistence = readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/persistence.service.ts'),
  'utf8',
)

describe('KC7 voice transcript store (Plan.md §39)', () => {
  it('creates a per-user RLS transcript table with service-role-only writes', () => {
    expect(migration).toContain('create table if not exists public.kael_voice_transcript')
    expect(migration).toContain('alter table public.kael_voice_transcript enable row level security')
    expect(migration).toContain('revoke all on public.kael_voice_transcript from authenticated')
    expect(migration).toContain('grant select on public.kael_voice_transcript to authenticated')
    expect(migration).toContain('grant all on public.kael_voice_transcript to service_role')
    expect(migration).toContain('using ((select auth.uid()) = user_id)')
    expect(migration).toContain('using (private.is_admin())')
    // stores scrubbed text only; no audio column (audio never uploaded, §36 D1)
    expect(migration).toContain('scrubbed_text text not null')
    expect(migration).not.toMatch(/audio\w*\s+(?:bytea|text|jsonb|uuid)\b/i)
    expect(migration).toContain("source in ('on_device_stt', 'typed')")
  })

  it('adds a candidate-only loop-learning table that never auto-mutates the charter', () => {
    expect(migration).toContain('create table if not exists public.kael_region_lexicon_candidate')
    expect(migration).toContain("status text not null default 'candidate'")
    expect(migration).toContain('grant all on public.kael_region_lexicon_candidate to service_role')
    expect(migration).toContain('revoke all on public.kael_region_lexicon_candidate from authenticated')
  })

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
