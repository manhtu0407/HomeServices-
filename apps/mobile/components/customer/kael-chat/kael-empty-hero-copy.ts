export type CustomerKaelEmptyHeroMode = 'case' | 'normal'

type CustomerKaelEmptyHeroLanguage = 'en' | 'vi'

type LocalizedEmptyHeroLine = Readonly<{
  en: string
  vi: string
}>

const HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * HOUR_MS
const VIETNAM_UTC_OFFSET_MS = 7 * HOUR_MS

const EMPTY_HERO_LINES: Record<CustomerKaelEmptyHeroMode, readonly LocalizedEmptyHeroLine[]> = {
  normal: [
    {
      vi: 'Đêm đã yên. Cứ kể điều trong nhà đang khiến bạn bận tâm.',
      en: 'The night is quiet. Tell Kael what at home is still on your mind.',
    },
    {
      vi: 'Giữa giờ tĩnh lặng, Kael vẫn ở đây để cùng bạn gỡ điều còn vướng.',
      en: 'In this quiet hour, Kael is here to help untangle what remains unresolved.',
    },
    {
      vi: 'Trời sắp sáng. Mình bắt đầu từ điều cần rõ nhất nhé.',
      en: 'Morning is near. Let us begin with what most needs clarity.',
    },
    {
      vi: 'Buổi sáng nhẹ nhàng. Nhà bạn đang cần Kael hỗ trợ điều gì?',
      en: 'A gentle morning. What at home would you like Kael to help with?',
    },
    {
      vi: 'Ngày đã vào nhịp. Cứ đưa Kael câu hỏi quan trọng nhất.',
      en: 'The day is finding its rhythm. Bring Kael the question that matters most.',
    },
    {
      vi: 'Gần trưa rồi. Mình cùng giải quyết gọn điều đang làm bạn bận tâm.',
      en: 'Noon is close. Let us neatly resolve what has been weighing on your mind.',
    },
    {
      vi: 'Một nhịp nghỉ giữa ngày. Kael có thể giúp bạn sắp lại điều cần làm.',
      en: 'A pause in the middle of the day. Kael can help put the next steps in order.',
    },
    {
      vi: 'Chiều còn rộng. Mình bắt đầu từ việc quan trọng nhất nhé.',
      en: 'There is plenty of afternoon left. Let us start with the most important thing.',
    },
    {
      vi: 'Ngày đang dịu xuống. Còn điều gì cần Kael cùng tháo gỡ?',
      en: 'The day is softening. What would you like Kael to help untangle?',
    },
    {
      vi: 'Buổi tối vừa lên đèn. Kael sẵn sàng nghe điều bạn đang nghĩ.',
      en: 'The evening lights are on. Kael is ready to hear what is on your mind.',
    },
    {
      vi: 'Tối nay, mình cùng làm rõ một việc cho thật nhẹ lòng nhé.',
      en: 'Tonight, let us make one thing clear enough to feel a little lighter.',
    },
    {
      vi: 'Ngày sắp khép lại. Cứ để Kael giúp bạn chốt điều còn dang dở.',
      en: 'The day is almost over. Let Kael help bring one unfinished thought to a close.',
    },
  ],
  case: [
    {
      vi: 'Đêm đã sâu. Kael sẽ giúp bạn làm rõ nhu cầu trước khi tìm dịch vụ phù hợp.',
      en: 'The night is deep. Kael can clarify your needs before finding a suitable service.',
    },
    {
      vi: 'Giờ này, mình cứ chốt rõ phạm vi trước để việc điều phối chính xác hơn.',
      en: 'At this hour, let us clarify the scope so coordination can be more precise.',
    },
    {
      vi: 'Ngày mới đang mở. Mình cùng chuẩn bị một yêu cầu dịch vụ thật rõ ràng.',
      en: 'A new day is opening. Let us prepare a clear service request together.',
    },
    {
      vi: 'Buổi sáng bắt đầu. Hãy kể Kael vấn đề, vị trí và thời điểm bạn cần.',
      en: 'Morning is beginning. Tell Kael the issue, location, and timing you need.',
    },
    {
      vi: 'Ngày đã vào nhịp. Kael sẵn sàng phân tích nhu cầu dịch vụ của bạn.',
      en: 'The day is in motion. Kael is ready to analyze your service needs.',
    },
    {
      vi: 'Gần trưa rồi. Mình cùng chốt phạm vi để tìm phương án dịch vụ phù hợp.',
      en: 'Noon is close. Let us confirm the scope to find a suitable service path.',
    },
    {
      vi: 'Giữa ngày, mô tả càng rõ thì việc điều phối càng sát nhu cầu.',
      en: 'At midday, clearer details make service coordination fit your needs more closely.',
    },
    {
      vi: 'Chiều còn rộng. Kael có thể cùng bạn đối chiếu phạm vi và thời gian.',
      en: 'There is plenty of afternoon left. Kael can compare scope and timing with you.',
    },
    {
      vi: 'Cuối chiều, mình cùng rà lại yêu cầu trước khi điều phối dịch vụ nhé.',
      en: 'Late afternoon is a good time to review the request before coordinating service.',
    },
    {
      vi: 'Buổi tối đã lên đèn. Cứ nói điều cần xử lý, Kael sẽ giúp bạn làm rõ.',
      en: 'The evening lights are on. Share what needs attention and Kael will clarify it.',
    },
    {
      vi: 'Tối nay, mình ưu tiên một yêu cầu rõ phạm vi, thời gian và mức độ cần thiết.',
      en: 'Tonight, let us prioritize a request with clear scope, timing, and urgency.',
    },
    {
      vi: 'Ngày sắp khép lại. Kael vẫn có thể giúp bạn chuẩn bị dịch vụ cho ngày mai.',
      en: 'The day is almost over. Kael can still help prepare tomorrow\'s service request.',
    },
  ],
}

export const CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT = {
  case: EMPTY_HERO_LINES.case.length,
  normal: EMPTY_HERO_LINES.normal.length,
} as const

function stableHash(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function getVietnamClock(now: Date) {
  return new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS)
}

export function getCustomerKaelEmptyHeroCopy(
  mode: CustomerKaelEmptyHeroMode,
  language: CustomerKaelEmptyHeroLanguage,
  now = new Date(),
) {
  const vietnamClock = getVietnamClock(now)
  const slot = Math.floor(vietnamClock.getUTCHours() / 2)
  const pairStart = Math.floor(slot / 2) * 2
  const slotWithinPair = slot % 2
  const dateKey = [
    vietnamClock.getUTCFullYear(),
    String(vietnamClock.getUTCMonth() + 1).padStart(2, '0'),
    String(vietnamClock.getUTCDate()).padStart(2, '0'),
  ].join('-')
  const shouldSwapPair = stableHash(`${dateKey}:${mode}:${pairStart}`) % 2 === 1
  const lineIndex = pairStart + (shouldSwapPair ? 1 - slotWithinPair : slotWithinPair)

  return {
    slot,
    text: EMPTY_HERO_LINES[mode][lineIndex][language],
  }
}

export function millisecondsUntilNextVietnamTwoHourSlot(now = new Date()) {
  const shiftedTimestamp = now.getTime() + VIETNAM_UTC_OFFSET_MS
  const remainder = ((shiftedTimestamp % TWO_HOURS_MS) + TWO_HOURS_MS) % TWO_HOURS_MS

  return remainder === 0 ? TWO_HOURS_MS : TWO_HOURS_MS - remainder
}
