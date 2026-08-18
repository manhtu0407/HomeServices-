export type CustomerKaelEmptyHeroMode = 'case' | 'normal'

type CustomerKaelEmptyHeroLanguage = 'en' | 'vi'

type LocalizedEmptyHeroLine = Readonly<{
  en: string
  vi: string
}>

const HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * HOUR_MS
const VIETNAM_UTC_OFFSET_MS = 7 * HOUR_MS

function englishLines(lines: readonly string[]): readonly LocalizedEmptyHeroLine[] {
  return lines.map((text) => ({ en: text, vi: text }))
}

const EMPTY_HERO_LINES: Record<CustomerKaelEmptyHeroMode, readonly LocalizedEmptyHeroLine[]> = {
  normal: englishLines([
    'Take a quiet breath...',
    'One thing at a time..',
    'Small steps still count!',
    'Clear space, clear mind...',
    'Start with what matters..!',
    'Let the day unfold...',
    'You\'ve got this!',
    'Make room for calm..',
    'Pause. Reset. Begin...',
    'Keep it simple today..!',
    'Your next step is enough...',
    'Less noise, more focus!',
    'Find your steady pace..',
    'Calm helps clarity...',
    'Give yourself a moment..!',
    'Let Kael help...',
    'Begin where you are!',
    'Make today feel lighter...',
    'A calmer day starts here..!',
    'Slow down, think clearly...',
  ]),
  case: englishLines([
    'Let\'s make the scope clear...',
    'Clear details, smoother service..',
    'Start with what needs care!',
    'One clear request at a time...',
    'Name the place, time, and need..!',
    'Good details guide good help...',
    'Let\'s make the next step clear..',
    'Small details make a difference!',
    'Describe it simply...',
    'Clarity helps good service..',
    'We can sort this together..',
    'Start with the essential details...',
    'Your home, your priorities!',
    'Let\'s narrow it down..',
    'Clear scope, better coordination...',
    'Tell Kael what matters most..!',
    'Ready when you are!',
    'Let\'s shape a better request...',
    'Less guesswork, more clarity..',
    'Good service starts with context...',
  ]),
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
