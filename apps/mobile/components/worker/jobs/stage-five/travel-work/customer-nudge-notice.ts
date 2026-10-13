import type { LocalCompletionNudge } from '@nestscout/shared'

import type { StageFiveLanguage } from './stage-five-copy'

export type CustomerNudgeNotice = { title: string; detail: string }

// What the worker is told after the customer asked Kael for a reminder. Only a reminder that was
// really sent shows: no nudge, or a job outside repair, shows nothing.
export function customerNudgeNotice(
  nudge: LocalCompletionNudge | null | undefined,
  jobStatus: string | null,
  clock: string | null,
  language: StageFiveLanguage,
): CustomerNudgeNotice | null {
  if (!nudge || nudge.used < 1 || jobStatus !== 'repairing') return null
  const when = clock ? (language === 'en' ? ` at ${clock}` : ` lúc ${clock}`) : ''
  return language === 'en'
    ? {
        title: 'The customer is waiting for your report',
        detail: `The customer reminded you${when} (${nudge.used}/${nudge.maxAllowed}). If the work is done, report it complete with photos.`,
      }
    : {
        title: 'Khách đang chờ bạn báo hoàn tất',
        detail: `Khách đã nhắc bạn${when} (${nudge.used}/${nudge.maxAllowed}). Nếu đã xong, hãy báo hoàn tất kèm ảnh.`,
      }
}
