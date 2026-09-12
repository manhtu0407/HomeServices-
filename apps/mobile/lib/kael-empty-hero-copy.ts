export type KaelEmptyHeroMode = 'intake' | 'normal'
export type KaelEmptyHeroLanguage = 'en' | 'vi'

type LocalizedEmptyHeroLine = Readonly<{
  en: string
  vi: string
}>

const EMPTY_HERO_LINES: Record<KaelEmptyHeroMode, readonly LocalizedEmptyHeroLine[]> = {
  normal: [
    { en: 'Take a quiet breath...', vi: 'Hít thở thật nhẹ nhàng...' },
    { en: 'One thing at a time..', vi: 'Từng việc một thôi...' },
    { en: 'Small steps still count!', vi: 'Mỗi bước nhỏ đều có ý nghĩa!' },
    { en: 'Clear space, clear mind...', vi: 'Không gian gọn, tâm trí nhẹ...' },
    { en: 'Start with what matters..!', vi: 'Bắt đầu từ điều quan trọng nhất!' },
    { en: 'Let the day unfold...', vi: 'Cứ để ngày mới nhẹ nhàng mở ra...' },
    { en: "You've got this!", vi: 'Bạn làm được mà!' },
    { en: 'Make room for calm..', vi: 'Dành một khoảng cho sự bình yên...' },
    { en: 'Pause. Reset. Begin...', vi: 'Dừng lại. Sắp xếp. Bắt đầu...' },
    { en: 'Keep it simple today..!', vi: 'Hôm nay cứ đơn giản thôi!' },
    { en: 'Your next step is enough...', vi: 'Bước tiếp theo là đủ rồi...' },
    { en: 'Less noise, more focus!', vi: 'Bớt xao nhãng, thêm tập trung!' },
    { en: 'Find your steady pace..', vi: 'Tìm nhịp điệu vừa sức...' },
    { en: 'Calm helps clarity...', vi: 'Bình tĩnh giúp mọi thứ rõ ràng hơn...' },
    { en: 'Give yourself a moment..!', vi: 'Cho mình một chút thời gian nhé!' },
    { en: 'Let Kael help...', vi: 'Để Kael hỗ trợ bạn...' },
    { en: 'Begin where you are!', vi: 'Bắt đầu ngay từ đây!' },
    { en: 'Make today feel lighter...', vi: 'Để hôm nay nhẹ nhàng hơn...' },
    { en: 'A calmer day starts here..!', vi: 'Một ngày an yên bắt đầu từ đây!' },
    { en: 'Slow down, think clearly...', vi: 'Chậm lại để nghĩ rõ hơn...' },
  ],
  intake: [
    { en: "Let's make the scope clear...", vi: 'Cùng làm rõ phạm vi công việc...' },
    { en: 'Clear details, smoother service..', vi: 'Chi tiết rõ ràng, dịch vụ thuận lợi hơn...' },
    { en: 'Start with what needs care!', vi: 'Bắt đầu từ điều cần được xử lý!' },
    { en: 'One clear request at a time...', vi: 'Mỗi lần một yêu cầu rõ ràng...' },
    { en: 'Name the place, time, and need..!', vi: 'Cho biết địa điểm, thời gian và nhu cầu nhé!' },
    { en: 'Good details guide good help...', vi: 'Thông tin đầy đủ giúp hỗ trợ chính xác...' },
    { en: "Let's make the next step clear..", vi: 'Cùng làm rõ bước tiếp theo...' },
    { en: 'Small details make a difference!', vi: 'Chi tiết nhỏ tạo nên khác biệt!' },
    { en: 'Describe it simply...', vi: 'Hãy mô tả thật đơn giản...' },
    { en: 'Clarity helps good service..', vi: 'Thông tin rõ giúp phục vụ tốt hơn...' },
    { en: 'We can sort this together..', vi: 'Chúng ta sẽ cùng làm rõ...' },
    { en: 'Start with the essential details...', vi: 'Bắt đầu từ những thông tin thiết yếu...' },
    { en: 'Your home, your priorities!', vi: 'Ngôi nhà của bạn, ưu tiên của bạn!' },
    { en: "Let's narrow it down..", vi: 'Cùng thu hẹp nhu cầu nhé...' },
    { en: 'Clear scope, better coordination...', vi: 'Phạm vi rõ ràng giúp phối hợp tốt hơn...' },
    { en: 'Tell Kael what matters most..!', vi: 'Hãy cho Kael biết điều quan trọng nhất!' },
    { en: 'Ready when you are!', vi: 'Kael sẵn sàng khi bạn sẵn sàng!' },
    { en: "Let's shape a better request...", vi: 'Cùng hoàn thiện yêu cầu rõ ràng hơn...' },
    { en: 'Less guesswork, more clarity..', vi: 'Bớt phỏng đoán, thêm rõ ràng...' },
    { en: 'Good service starts with context...', vi: 'Dịch vụ tốt bắt đầu từ thông tin đầy đủ...' },
  ],
}

export const KAEL_EMPTY_HERO_LINE_COUNT = {
  intake: EMPTY_HERO_LINES.intake.length,
  normal: EMPTY_HERO_LINES.normal.length,
} as const

const HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * HOUR_MS
const VIETNAM_UTC_OFFSET_MS = 7 * HOUR_MS

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

export function getKaelEmptyHeroCopy(
  mode: KaelEmptyHeroMode,
  language: KaelEmptyHeroLanguage,
  now = new Date(),
) {
  const vietnamClock = getVietnamClock(now)
  const slot = Math.floor(vietnamClock.getUTCHours() / 2)
  const dateKey = [
    vietnamClock.getUTCFullYear(),
    String(vietnamClock.getUTCMonth() + 1).padStart(2, '0'),
    String(vietnamClock.getUTCDate()).padStart(2, '0'),
  ].join('-')
  const lineIndex = stableHash(`${dateKey}:${mode}:${slot}`) % EMPTY_HERO_LINES[mode].length

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
