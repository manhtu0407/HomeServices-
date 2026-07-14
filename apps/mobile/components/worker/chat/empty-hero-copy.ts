export type WorkerKaelEmptyHeroMode = 'intake' | 'normal'

type WorkerKaelEmptyHeroLanguage = 'en' | 'vi'

type LocalizedEmptyHeroLine = Readonly<{
  en: string
  vi: string
}>

const HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * HOUR_MS
const VIETNAM_UTC_OFFSET_MS = 7 * HOUR_MS

const EMPTY_HERO_LINES: Record<WorkerKaelEmptyHeroMode, readonly LocalizedEmptyHeroLine[]> = {
  normal: [
    {
      vi: 'Đêm đã yên. Kael vẫn ở đây để cùng bạn gỡ từng điều còn vướng.',
      en: 'The night is quiet. Kael is here to help untangle what still feels unresolved.',
    },
    {
      vi: 'Giữa giờ tĩnh lặng, cứ nói điều bạn đang nghĩ. Kael sẽ đi thẳng vào trọng tâm.',
      en: 'In this quiet hour, say what is on your mind. Kael will keep to what matters.',
    },
    {
      vi: 'Trời sắp sáng rồi. Mình cùng khởi đầu bằng điều cần rõ nhất nhé.',
      en: 'Morning is near. Let us begin with the one thing that most needs clarity.',
    },
    {
      vi: 'Buổi sáng nhẹ nhàng. Hôm nay bạn muốn Kael cùng lo điều gì?',
      en: 'A gentle morning. What would you like Kael to help with today?',
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
      en: 'A pause in the middle of the day. Kael can help put your next steps in order.',
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
      vi: 'Buổi tối vừa lên đèn. Kael sẵn sàng nghe chuyện của bạn.',
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
  intake: [
    {
      vi: 'Đêm đã sâu. Mình chỉ giữ lại những cơ hội thật sự đáng cân nhắc.',
      en: 'The night is deep. Let us keep only the opportunities truly worth considering.',
    },
    {
      vi: 'Giờ này, chọn kỹ quan trọng hơn chọn nhiều. Mình cùng xem điều kiện phù hợp nhé.',
      en: 'At this hour, choosing carefully matters more than choosing often. Let us check the fit.',
    },
    {
      vi: 'Ngày mới đang mở. Mình cùng chuẩn bị một lịch nhận việc vừa sức.',
      en: 'A new day is opening. Let us prepare a workload that stays manageable.',
    },
    {
      vi: 'Buổi sáng bắt đầu. Hãy ưu tiên việc gần, rõ và hợp tay nghề.',
      en: 'Morning is beginning. Prioritize work that is nearby, clear, and suited to your skills.',
    },
    {
      vi: 'Giờ làm việc đã vào nhịp. Khi có cơ hội phù hợp, mình cùng soi kỹ từng điều kiện.',
      en: 'The workday is in motion. When an opportunity fits, we can examine each condition carefully.',
    },
    {
      vi: 'Gần trưa rồi. Mình giữ lịch gọn để không nhận quá sức nhé.',
      en: 'Noon is close. Let us keep the schedule clear enough to avoid taking on too much.',
    },
    {
      vi: 'Giữa ngày, một lịch vừa sức sẽ đi xa hơn một lịch quá đầy.',
      en: 'At midday, a balanced schedule will carry you farther than an overloaded one.',
    },
    {
      vi: 'Chiều còn nhiều nhịp. Mình cùng chọn việc hợp kỹ năng và quãng đường.',
      en: 'There is plenty of afternoon left. Let us choose work that fits both skill and distance.',
    },
    {
      vi: 'Cuối chiều, hãy cân lại thời gian trước khi nhận thêm việc.',
      en: 'Late afternoon is a good time to check your hours before accepting more work.',
    },
    {
      vi: 'Buổi tối đã lên đèn. Chỉ nhận việc khi lịch trình vẫn đủ an toàn và thoải mái.',
      en: 'The evening lights are on. Accept work only while the schedule still feels safe and comfortable.',
    },
    {
      vi: 'Tối nay, mình ưu tiên cơ hội rõ phạm vi và vừa quãng đường nhé.',
      en: 'Tonight, let us favor opportunities with a clear scope and a reasonable journey.',
    },
    {
      vi: 'Ngày sắp khép lại. Mình cùng giữ lịch ngày mai thật sáng rõ.',
      en: 'The day is almost over. Let us keep tomorrow\'s schedule clear and easy to read.',
    },
  ],
}

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

export function getWorkerKaelEmptyHeroCopy(
  mode: WorkerKaelEmptyHeroMode,
  language: WorkerKaelEmptyHeroLanguage,
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
