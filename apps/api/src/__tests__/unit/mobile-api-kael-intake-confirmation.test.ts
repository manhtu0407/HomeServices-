import { describe, expect, it } from 'vitest'

import {
  buildKaelIntakeConfirmation,
  kaelIntakeConfirmationSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation'

const FUTURE_NOW = new Date('2026-07-29T00:00:00.000Z')

function bookingInput(overrides: Partial<Parameters<typeof buildKaelIntakeConfirmation>[0]> = {}) {
  return {
    addressDistrict: 'Quận 3',
    addressLabel: 'Chung cư Căn Hộ An Gia, Phường Võ Thị Sáu, Quận 3',
    description: 'Ổ cắm trong bếp chập chờn và phát tiếng lẹt xẹt khi cắm ấm nước.',
    language: 'vi' as const,
    problemChips: ['Ổ cắm/công tắc hỏng'],
    profileId: 'electric_diagnose' as const,
    scheduleWindow: {
      date: '2026-07-30',
      end: '12:00',
      start: '10:00',
      time_zone: 'Asia/Ho_Chi_Minh' as const,
    },
    scheduledAt: '2026-07-30T03:00:00.000Z',
    serviceType: 'electrical' as const,
    ...overrides,
  }
}

describe('Kael booking intake confirmation Pre-Step', () => {
  it('returns a validated, customer-confirmable summary before analysis', () => {
    const result = buildKaelIntakeConfirmation(bookingInput(), FUTURE_NOW)

    expect(kaelIntakeConfirmationSchema.parse(result)).toEqual(result)
    expect(result.status).toBe('pending')
    expect(result.blocking).toBe(false)
    expect(result.fields.map((field) => field.key)).toEqual([
      'service',
      'problem',
      'description',
      'location',
      'schedule',
    ])
    expect(result.fields.find((field) => field.key === 'schedule')?.value).toContain('10:00')
    expect(result.focus).toContain('nguồn điện')
  })

  it('covers all six production services with service-specific focus', () => {
    const services = [
      ['electrical', 'electric_diagnose', 'nguồn điện'],
      ['plumbing', 'water_diagnose', 'rò rỉ'],
      ['cleaning', 'clean_scope', 'diện tích'],
      ['hvac', 'air_scope', 'thiết bị'],
      ['upholstery', 'fabric_scope', 'chất liệu'],
      ['handyman', 'task_scope', 'hạng mục'],
    ] as const

    for (const [serviceType, profileId, focus] of services) {
      const result = buildKaelIntakeConfirmation(bookingInput({
        description: `Khách đã mô tả rõ nhu cầu ${serviceType} trong căn hộ và thời điểm phát sinh.`,
        problemChips: [`Vấn đề ${serviceType}`],
        profileId,
        serviceType,
      }), FUTURE_NOW)

      expect(result.focus).toContain(focus)
      expect(result.fields[0]).toMatchObject({ key: 'service', state: 'clear' })
    }
  })

  it('blocks a past or internally inconsistent schedule', () => {
    const past = buildKaelIntakeConfirmation(bookingInput({
      scheduleWindow: {
        date: '2026-07-28',
        end: '12:00',
        start: '10:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
      scheduledAt: '2026-07-28T03:00:00.000Z',
    }), FUTURE_NOW)
    const mismatch = buildKaelIntakeConfirmation(bookingInput({
      scheduledAt: '2026-07-30T04:00:00.000Z',
    }), FUTURE_NOW)

    expect(past.blocking).toBe(true)
    expect(past.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'schedule_past', field: 'schedule', severity: 'blocking' }),
    ]))
    expect(mismatch.blocking).toBe(true)
    expect(mismatch.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'schedule_window_mismatch', field: 'schedule', severity: 'blocking' }),
    ]))
  })

  it('flags a high-confidence service mismatch without calling a model', () => {
    const result = buildKaelIntakeConfirmation(bookingInput({
      description: 'Bồn cầu bị tắc nghẹt, nước trong đường ống trào ngược và rò nước.',
    }), FUTURE_NOW)

    expect(result.blocking).toBe(true)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'service_mismatch',
        field: 'description',
        severity: 'blocking',
      }),
    ]))
  })

  it('surfaces deterministic electrical safety attention without claiming verification', () => {
    const result = buildKaelIntakeConfirmation(bookingInput({
      description: 'Ổ cắm phát tia lửa và có nước thấm sát nguồn điện.',
    }), FUTURE_NOW)

    expect(result.fields.find((field) => field.key === 'description')).toMatchObject({
      state: 'attention',
    })
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'safety_attention',
        field: 'description',
        severity: 'attention',
      }),
    ]))
    expect(result.question).toContain('xác nhận')
    expect(JSON.stringify(result)).not.toContain('đã xác minh')
  })
})
