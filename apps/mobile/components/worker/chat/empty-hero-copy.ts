export type WorkerKaelEmptyHeroMode = 'intake' | 'normal'
type WorkerKaelEmptyHeroLanguage = 'en' | 'vi'

type LocalizedWorkerEmptyHeroLine = Readonly<{
  en: string
  vi: string
}>

const EMPTY_HERO_LINES: Record<WorkerKaelEmptyHeroMode, readonly LocalizedWorkerEmptyHeroLine[]> = {
  normal: [
    { en: 'Take a quiet breath...', vi: 'Take a quiet breath...' },
    { en: 'One thing at a time..', vi: 'One thing at a time..' },
    { en: 'Small steps still count!', vi: 'Small steps still count!' },
    { en: 'Clear space, clear mind...', vi: 'Clear space, clear mind...' },
    { en: 'Start with what matters..!', vi: 'Start with what matters..!' },
    { en: 'Let the day unfold...', vi: 'Let the day unfold...' },
    { en: "You've got this!", vi: "You've got this!" },
    { en: 'Make room for calm..', vi: 'Make room for calm..' },
    { en: 'Pause. Reset. Begin...', vi: 'Pause. Reset. Begin...' },
    { en: 'Keep it simple today..!', vi: 'Keep it simple today..!' },
    { en: 'Your next step is enough...', vi: 'Your next step is enough...' },
    { en: 'Less noise, more focus!', vi: 'Less noise, more focus!' },
    { en: 'Find your steady pace..', vi: 'Find your steady pace..' },
    { en: 'Calm helps clarity...', vi: 'Calm helps clarity...' },
    { en: 'Give yourself a moment..!', vi: 'Give yourself a moment..!' },
    { en: 'Let Kael help...', vi: 'Let Kael help...' },
    { en: 'Begin where you are!', vi: 'Begin where you are!' },
    { en: 'Make today feel lighter...', vi: 'Make today feel lighter...' },
    { en: 'A calmer day starts here..!', vi: 'A calmer day starts here..!' },
    { en: 'Slow down, think clearly...', vi: 'Slow down, think clearly...' },
  ],
  intake: [
    { en: "Let's make the scope clear...", vi: "Let's make the scope clear..." },
    { en: 'Clear details, smoother service..', vi: 'Clear details, smoother service..' },
    { en: 'Start with what needs care!', vi: 'Start with what needs care!' },
    { en: 'One clear request at a time...', vi: 'One clear request at a time...' },
    { en: 'Name the place, time, and need..!', vi: 'Name the place, time, and need..!' },
    { en: 'Good details guide good help...', vi: 'Good details guide good help...' },
    { en: "Let's make the next step clear..", vi: "Let's make the next step clear.." },
    { en: 'Small details make a difference!', vi: 'Small details make a difference!' },
    { en: 'Describe it simply...', vi: 'Describe it simply...' },
    { en: 'Clarity helps good service..', vi: 'Clarity helps good service..' },
    { en: 'We can sort this together..', vi: 'We can sort this together..' },
    { en: 'Start with the essential details...', vi: 'Start with the essential details...' },
    { en: 'Your home, your priorities!', vi: 'Your home, your priorities!' },
    { en: "Let's narrow it down..", vi: "Let's narrow it down.." },
    { en: 'Clear scope, better coordination...', vi: 'Clear scope, better coordination...' },
    { en: 'Tell Kael what matters most..!', vi: 'Tell Kael what matters most..!' },
    { en: 'Ready when you are!', vi: 'Ready when you are!' },
    { en: "Let's shape a better request...", vi: "Let's shape a better request..." },
    { en: 'Less guesswork, more clarity..', vi: 'Less guesswork, more clarity..' },
    { en: 'Good service starts with context...', vi: 'Good service starts with context...' },
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
