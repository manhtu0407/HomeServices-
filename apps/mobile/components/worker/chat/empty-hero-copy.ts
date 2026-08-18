import { getCustomerKaelEmptyHeroCopy } from '@/components/customer/kael-chat/kael-empty-hero-copy'

export type WorkerKaelEmptyHeroMode = 'intake' | 'normal'
type WorkerKaelEmptyHeroLanguage = 'en' | 'vi'

export function getWorkerKaelEmptyHeroCopy(
  mode: WorkerKaelEmptyHeroMode,
  _language: WorkerKaelEmptyHeroLanguage,
  now = new Date(),
) {
  return getCustomerKaelEmptyHeroCopy(mode === 'intake' ? 'case' : 'normal', 'en', now)
}

export { millisecondsUntilNextVietnamTwoHourSlot } from '@/components/customer/kael-chat/kael-empty-hero-copy'
