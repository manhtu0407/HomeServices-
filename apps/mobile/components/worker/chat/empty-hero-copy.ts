export type WorkerKaelEmptyHeroMode = 'intake' | 'normal'
type WorkerKaelEmptyHeroLanguage = 'en' | 'vi'

type LocalizedWorkerEmptyHeroLine = Readonly<{
  en: string
  vi: string
}>

const EMPTY_HERO_LINES: Record<WorkerKaelEmptyHeroMode, readonly LocalizedWorkerEmptyHeroLine[]> = {
  normal: [
    { en: 'Take a quiet breath...', vi: 'Thở chậm một nhịp nhé...' },
    { en: 'One thing at a time..', vi: 'Đi từng việc một thôi..' },
    { en: 'Small steps still count!', vi: 'Những bước nhỏ vẫn đáng kể!' },
    { en: 'Clear space, clear mind...', vi: 'Dọn chỗ cho sự bình tâm...' },
    { en: 'Start with what matters..!', vi: 'Bắt đầu từ điều quan trọng..!' },
    { en: 'Let the day unfold...', vi: 'Cứ để hôm nay trôi nhẹ...' },
    { en: "You've got this!", vi: 'Bạn làm được mà!' },
    { en: 'Make room for calm..', vi: 'Để lòng mình có chỗ nghỉ..' },
    { en: 'Pause. Reset. Begin...', vi: 'Dừng lại. Làm mới. Bắt đầu...' },
    { en: 'Keep it simple today..!', vi: 'Hôm nay cứ đơn giản thôi..!' },
    { en: 'Your next step is enough...', vi: 'Bước tiếp theo là đủ...' },
    { en: 'Less noise, more focus!', vi: 'Ít ồn hơn, tập trung hơn!' },
    { en: 'Find your steady pace..', vi: 'Tìm nhịp điệu ổn định..' },
    { en: 'Calm helps clarity...', vi: 'Bình tâm để sáng rõ...' },
    { en: 'Give yourself a moment..!', vi: 'Cho mình một phút nhé..!' },
    { en: 'Let Kael help...', vi: 'Để Kael hỗ trợ...' },
    { en: 'Begin where you are!', vi: 'Bắt đầu từ nơi bạn đang đứng!' },
    { en: 'Make today feel lighter...', vi: 'Để hôm nay nhẹ hơn...' },
    { en: 'A calmer day starts here..!', vi: 'Ngày bình tâm bắt đầu từ đây..!' },
    { en: 'Slow down, think clearly...', vi: 'Chậm lại để nghĩ rõ hơn...' },
  ],
  intake: [
    { en: "Let's make the scope clear...", vi: 'Để Kael cùng làm rõ phạm vi...' },
    { en: 'Clear details, smoother service..', vi: 'Chi tiết rõ, hỗ trợ trơn tru hơn..' },
    { en: 'Start with what needs care!', vi: 'Bắt đầu từ điều cần chăm sóc!' },
    { en: 'One clear request at a time...', vi: 'Mỗi lần một yêu cầu rõ ràng...' },
    { en: 'Name the place, time, and need..!', vi: 'Nêu rõ nơi, thời gian và nhu cầu..!' },
    { en: 'Good details guide good help...', vi: 'Chi tiết tốt dẫn tới hỗ trợ tốt...' },
    { en: "Let's make the next step clear..", vi: 'Cùng làm rõ bước tiếp theo..' },
    { en: 'Small details make a difference!', vi: 'Chi tiết nhỏ tạo khác biệt!' },
    { en: 'Describe it simply...', vi: 'Mô tả thật đơn giản...' },
    { en: 'Clarity helps good service..', vi: 'Rõ ràng giúp dịch vụ tốt hơn..' },
    { en: 'We can sort this together..', vi: 'Cùng Kael sắp xếp nhé..' },
    { en: 'Start with the essential details...', vi: 'Bắt đầu từ thông tin thiết yếu...' },
    { en: 'Your home, your priorities!', vi: 'Ngôi nhà và ưu tiên của bạn!' },
    { en: "Let's narrow it down..", vi: 'Cùng thu hẹp nhu cầu nhé..' },
    { en: 'Clear scope, better coordination...', vi: 'Phạm vi rõ, phối hợp tốt hơn...' },
    { en: 'Tell Kael what matters most..!', vi: 'Nói Kael điều quan trọng nhất..!' },
    { en: 'Ready when you are!', vi: 'Sẵn sàng khi bạn muốn!' },
    { en: "Let's shape a better request...", vi: 'Cùng dựng yêu cầu rõ hơn...' },
    { en: 'Less guesswork, more clarity..', vi: 'Ít phỏng đoán, nhiều rõ ràng hơn..' },
    { en: 'Good service starts with context...', vi: 'Dịch vụ tốt bắt đầu từ bối cảnh...' },
  ],
}

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

export function getWorkerKaelEmptyHeroCopy(
  mode: WorkerKaelEmptyHeroMode,
  language: WorkerKaelEmptyHeroLanguage,
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
