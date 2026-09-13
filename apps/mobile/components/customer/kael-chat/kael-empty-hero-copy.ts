import {
  getKaelEmptyHeroCopy,
  KAEL_EMPTY_HERO_LINE_COUNT,
  type KaelEmptyHeroLanguage,
} from '@/lib/kael-empty-hero-copy'

export { millisecondsUntilNextVietnamTwoHourSlot } from '@/lib/kael-empty-hero-copy'
export type CustomerKaelEmptyHeroMode = 'case' | 'normal'

export const CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT = {
  case: KAEL_EMPTY_HERO_LINE_COUNT.intake,
  normal: KAEL_EMPTY_HERO_LINE_COUNT.normal,
} as const

export function getCustomerKaelEmptyHeroCopy(
  mode: CustomerKaelEmptyHeroMode,
  language: KaelEmptyHeroLanguage,
  now = new Date(),
) {
  return getKaelEmptyHeroCopy(mode === 'case' ? 'intake' : mode, language, now)
}
