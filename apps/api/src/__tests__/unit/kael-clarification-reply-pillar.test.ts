import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  isClarificationExplanationRequest,
  isGroundedClarificationAnswer,
  isUnknownClarificationAnswer,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-runtime'

export const PILLAR = {
  id: 'P395-kael-clarification-reply-reading',
  invariant:
    'a reply to a pending Kael question is read as an explanation request only when it asks why or what is missing and carries no case fact; a fact in the same message always wins, and a service, unit or building name is never mistaken for the question',
  authority: [
    'governance/RULES.md #8 (a question is never stored as the customer\'s fact, and nothing is invented to fill the gap)',
    'governance/RULES.md #5 (Vietnamese-first: diacritics, no diacritics and English all read the same)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/language/clarification-reply.ts',
  layer: 'unit',
  siblings: ['P386-kael-clarification-loop-breaker', 'P367-kael-slot-question-catalog'],
  mutation:
    'drop "tai sao" from the why leads — the Vietnamese WHY cases turn red; match a bare "sao" without its next word, or "tai sao" without a process word after it — the Sao Mai negatives turn red; stop counting a clause with facts — every mixed case turns red',
} as const satisfies PillarManifest

// why     pure explanation request: explanation true, never stored as a fact
// answer  a fact for the pending slot: stored
// unknown "I do not know": routed to on-site verification
// mixed   fact + question in one message. The fact wins: explanation false, grounded true.
//         The pipeline then reports what is still missing on the same turn, so the question is not lost.
type Label = 'why' | 'answer' | 'unknown' | 'mixed'
type Row = readonly [id: string, text: string, label: Label]

const VIETNAMESE: readonly Row[] = [
  ['VI-01', 'Tại sao chưa đủ dữ kiện?', 'why'],
  ['VI-02', 'Vì sao chưa có giá?', 'why'],
  ['VI-03', 'Sao vẫn chưa báo được giá?', 'why'],
  ['VI-04', 'Thiếu thông tin gì?', 'why'],
  ['VI-05', 'Giải thích giúp tôi', 'why'],
  ['VI-06', 'tai sao chua du du kien', 'why'],
  ['VI-07', 'vi sao chua co gia', 'why'],
  ['VI-08', 'sao van chua bao duoc gia', 'why'],
  ['VI-09', 'thieu thong tin gi vay', 'why'],
  ['VI-10', 'giai thich giup toi', 'why'],
  ['VI-11', 'TẠI SAO CHƯA CÓ GIÁ???', 'why'],
  ['VI-12', 'Ủa sao chưa có giá vậy?', 'why'],
  ['VI-13', 'Sao chưa có giá vậy ạ', 'why'],
  ['VI-14', 'Dạ cho em hỏi tại sao chưa báo giá được ạ?', 'why'],
  ['VI-15', 'Mà vì sao Kael cứ hỏi hoài vậy?', 'why'],
  ['VI-16', 'Sao lại phải hỏi thêm?', 'why'],
  ['VI-17', 'Sao phải hỏi nhiều thế?', 'why'],
  ['VI-18', 'Còn thiếu gì nữa?', 'why'],
  ['VI-19', 'Cần thêm thông tin gì nữa?', 'why'],
  ['VI-20', 'Kael còn cần biết gì nữa?', 'why'],
  ['VI-21', 'Giải thích đi', 'why'],
  ['VI-22', 'Nghĩa là sao? Giải thích đi.', 'why'],
  ['VI-23', 'Ý là gì vậy?', 'why'],
  ['VI-24', 'Là như nào?', 'why'],
  ['VI-25', 'Nói rõ hơn được không?', 'why'],
  ['VI-26', 'Tại sao Kael cần biết điều này?', 'why'],
  ['VI-27', 'Vì sao hỏi công suất?', 'why'],
  ['VI-28', 'Sao hỏi vậy?', 'why'],
  ['VI-29', 'Tại sao?', 'why'],
  ['VI-30', 'Cho mình hỏi sao chưa có giá?', 'why'],
  ['VI-31', 'Bạn nói vậy nghĩa là sao?', 'why'],
  ['VI-32', 'Sao mãi chưa có giá?', 'why'],
  ['VI-33', 'Không biết. Tại sao hỏi vậy?', 'why'],
  ['VI-34', 'Có thể giải thích không?', 'why'],
  ['VI-35', 'Tôi không hiểu, giải thích giúp tôi', 'why'],
  ['VI-36', 'Hả? Là sao?', 'why'],
]

const ENGLISH: readonly Row[] = [
  ['EN-01', "Why isn't the quote ready?", 'why'],
  ['EN-02', 'Why no price yet?', 'why'],
  ['EN-03', "Why can't you give me a price?", 'why'],
  ['EN-04', 'Why do you need that?', 'why'],
  ['EN-05', 'What information is missing?', 'why'],
  ['EN-06', 'What else do you need from me?', 'why'],
  ['EN-07', 'Please explain', 'why'],
  ['EN-08', 'Can you explain why?', 'why'],
  ['EN-09', 'How come there is no price?', 'why'],
  ['EN-10', 'What do you mean?', 'why'],
  ['EN-11', 'WHY ARE YOU ASKING THIS', 'why'],
  ['EN-12', 'Why isn’t the quote ready?', 'why'],
  ['EN-13', "I don't understand, can you explain?", 'why'],
]

const MIXED: readonly Row[] = [
  ['MX-01', '2 máy 1HP, còn thiếu gì?', 'mixed'],
  ['MX-02', '2 máy treo tường 1HP, sao chưa có giá?', 'mixed'],
  ['MX-03', 'Máy 1HP, 2 bộ. Giải thích giúp tôi', 'mixed'],
  ['MX-04', "Two 1HP wall units. Why isn't the quote ready?", 'mixed'],
  ['MX-05', '2 may treo tuong 1hp tai sao chua co gia', 'mixed'],
  ['MX-06', 'Có. Mà sao hỏi vậy?', 'mixed'],
]

const HARD_NEGATIVES: readonly Row[] = [
  ['NEG-01', '2 máy treo tường 1HP.', 'answer'],
  ['NEG-02', 'Máy 1HP, 2 bộ', 'answer'],
  ['NEG-03', 'Không biết công suất', 'unknown'],
  ['NEG-04', 'Sao Mai 1HP', 'answer'],
  ['NEG-05', 'Chung cư Sao Mai, tầng 5, 2 máy 1HP', 'answer'],
  ['NEG-06', 'Căn hộ tại Sao Mai, 2 máy 1HP', 'answer'],
  ['NEG-07', 'Tại Sao Mai Residence, 2 máy 1HP', 'answer'],
  ['NEG-08', 'Nhầm rồi, là máy 1.5HP chứ không phải 1HP', 'answer'],
  ['NEG-09', 'Đúng rồi, 2 máy treo tường', 'answer'],
  ['NEG-10', 'Ok, chốt vậy nhé', 'answer'],
  ['NEG-11', 'Thợ trước giải thích là hỏng tụ, máy 1HP', 'answer'],
  ['NEG-12', 'Vì máy cũ nên chạy yếu, 1HP', 'answer'],
  ['NEG-13', 'That is why I need two units, 1HP each', 'answer'],
  ['NEG-14', "I'm not sure about the capacity", 'unknown'],
  ['NEG-15', 'Tôi cũng chưa rõ', 'unknown'],
  ['NEG-16', 'Tại Sao Mai Residence', 'answer'],
  ['NEG-17', 'Vì Sao Mai block B', 'answer'],
  ['NEG-18', 'Tôi không hiểu sao máy chỉ chạy 2 tiếng rồi tắt', 'answer'],
]

function expected(label: Label) {
  return {
    explanation: label === 'why',
    grounded: label === 'answer' || label === 'mixed',
    unknown: label === 'unknown',
  }
}

function readAll(text: string) {
  return {
    explanation: isClarificationExplanationRequest(text),
    grounded: isGroundedClarificationAnswer(text),
    unknown: isUnknownClarificationAnswer(text),
  }
}

describe(`${PILLAR.id}: corpus`, () => {
  it('meets the declared corpus size', () => {
    expect(VIETNAMESE.length).toBeGreaterThanOrEqual(25)
    expect(ENGLISH.length).toBeGreaterThanOrEqual(8)
    expect(HARD_NEGATIVES.length).toBeGreaterThanOrEqual(10)
    const ids = [...VIETNAMESE, ...ENGLISH, ...MIXED, ...HARD_NEGATIVES].map(([id]) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  describe.each([
    ['Vietnamese explanation requests', VIETNAMESE],
    ['English explanation requests', ENGLISH],
    ['mixed fact + question: the fact wins', MIXED],
    ['hard negatives', HARD_NEGATIVES],
  ] as const)('%s', (_group, rows) => {
    it.each(rows)('%s %j is read as expected', (_id, text, label) => {
      expect(readAll(text), pillarWhy(PILLAR, `${_id} ${JSON.stringify(text)} labelled ${label}`))
        .toEqual(expected(label))
    })
  })

  it('never reads a hard negative as an explanation request', () => {
    const falsePositives = HARD_NEGATIVES.filter(([, text]) => isClarificationExplanationRequest(text))
    expect(falsePositives.map(([id]) => id), pillarWhy(PILLAR, 'hard negatives must stay at zero false positives')).toEqual([])
  })
})

describe(`${PILLAR.id}: the screenshot incident`, () => {
  it('reads the exact incident wording as a question and not as the unit answer', () => {
    expect(isClarificationExplanationRequest('Tại sao chưa đủ dữ kiện?'), pillarWhy(PILLAR, 'screenshot phrase')).toBe(true)
    expect(isGroundedClarificationAnswer('Tại sao chưa đủ dữ kiện?')).toBe(false)
    expect(isGroundedClarificationAnswer('2 máy treo tường 1HP.')).toBe(true)
    expect(isClarificationExplanationRequest('2 máy treo tường 1HP.')).toBe(false)
  })

  it.each([
    'Vì sao chưa có giá?',
    'Sao vẫn chưa báo được giá?',
    'tai sao chua du du kien',
  ])('reads the paraphrase %j the same way', (text) => {
    expect(isClarificationExplanationRequest(text), pillarWhy(PILLAR, text)).toBe(true)
    expect(isGroundedClarificationAnswer(text)).toBe(false)
  })
})

describe(`${PILLAR.id}: bounds`, () => {
  it.each(['', '   ', '\n\n', '?', '???', ',', '.', 'Sao', 'sao?', 'tại', 'vì'])(
    'does not throw on %j',
    (text) => {
      expect(() => readAll(text)).not.toThrow()
    },
  )

  it('treats empty input as neither a question nor an answer', () => {
    expect(readAll('')).toEqual({ explanation: false, grounded: false, unknown: false })
    expect(readAll('   ')).toEqual({ explanation: false, grounded: false, unknown: false })
  })

  it('reads a very long message without scanning it all as a question', () => {
    const long = `Tại sao chưa đủ dữ kiện? ${'2 máy treo tường 1HP. '.repeat(500)}`
    const started = Date.now()
    const reading = readAll(long)
    expect(Date.now() - started, pillarWhy(PILLAR, 'matching must stay linear in the message length')).toBeLessThan(250)
    expect(reading.explanation).toBe(false)
    expect(reading.grounded).toBe(true)
  })
})
