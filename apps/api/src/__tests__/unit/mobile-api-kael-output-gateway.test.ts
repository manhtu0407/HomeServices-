import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { guardOutput } from '../../../../../supabase/functions/mobile-api/_shared/kael/guards/output-gateway'

const repoRoot = join(__dirname, '../../../../../')

describe('Kael output gateway', () => {
  it('keeps one guard contract for canonical checks, regeneration, and safe output scrubbing', () => {
    const regenerated = guardOutput({
      text: 'Nguy hiểm chết người.',
      actor: 'customer',
      language: 'vi',
      surface: 'customer_normal',
      regenerate: () => 'Kael ghi nhận và sẽ hướng dẫn bước an toàn tiếp theo.',
      fallbackText: 'Kael tạm thời chưa thể trả lời nội dung này.',
    })

    expect(regenerated).toMatchObject({
      allowed: true,
      used_regeneration: true,
      used_fallback: false,
      trip: {
        surface: 'customer_normal',
        reason: 'fear_language',
        source: 'self_check',
      },
    })

    const scrubbed = guardOutput({
      text: 'Kael sẽ gửi tóm tắt qua test@example.com.',
      actor: 'worker',
      language: 'vi',
      surface: 'worker_assist',
      fallbackText: 'Kael tạm thời chưa thể trả lời nội dung này.',
    })

    expect(scrubbed).toMatchObject({ allowed: true, text: expect.stringContaining('[email]') })
    expect(scrubbed.trip).toBeUndefined()

    const longText = `Kael ghi nhận ${'x'.repeat(600)}`
    expect(guardOutput({
      text: longText,
      actor: 'worker',
      language: 'vi',
      surface: 'worker_assist',
      fallbackText: 'Kael tạm thời chưa thể trả lời nội dung này.',
    }).text).toBe(longText)
  })

  it('returns a safe fallback and trip metadata for compact exact-price output', () => {
    const result = guardOutput({
      text: 'Giá chốt là 500k/lần.',
      actor: 'customer',
      language: 'vi',
      surface: 'kael_chat_clarification',
      fallbackText: 'Kael cần thêm thông tin trước khi ước tính.',
    })

    expect(result).toMatchObject({
      allowed: false,
      text: 'Kael cần thêm thông tin trước khi ước tính.',
      used_fallback: true,
      trip: {
        surface: 'kael_chat_clarification',
        reason: 'exact_vnd',
        source: 'self_check',
      },
    })
  })

  it('routes all user-facing and orchestrator self-check paths through the shared gateway', () => {
    const files = [
      'supabase/functions/mobile-api/_shared/kael/stages/customer-assistant.ts',
      'supabase/functions/mobile-api/_shared/kael/stages/worker-assist.ts',
      'supabase/functions/mobile-api/_shared/kael/routing/orchestrator.ts',
      'supabase/functions/mobile-api/_shared/services/jobs/chat.ts',
      'supabase/functions/mobile-api/_shared/services/kael-chat/core.ts',
    ]

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), 'utf8')
      expect(source).toContain('guardOutput({')
      expect(source).not.toContain('runKaelSelfCheckPipeline')
    }
  })
})
