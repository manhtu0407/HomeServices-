import { useEffect, useState } from 'react'

import type { AppLanguage } from '@/lib/app-language'

const vietnamTimelineTimeZone = 'Asia/Ho_Chi_Minh'
const kaelTimelineRefreshMs = 60_000
const vietnamTimelineFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  timeZone: vietnamTimelineTimeZone,
})

type KaelTimelineWindow = 'afternoon' | 'evening' | 'late' | 'midday' | 'morning'

const kaelTimelineHeadlines: Record<AppLanguage, Record<KaelTimelineWindow, string[]>> = {
  en: {
    afternoon: [
      'Afternoon check-in, I am here.',
      'Need anything this afternoon?',
      'I will stay with you.',
      'Let me listen first.',
    ],
    evening: [
      'Evening now, I am here.',
      'Tell me what you need tonight.',
      'I am listening, gently.',
      'We can take it slowly.',
    ],
    late: [
      'Late now, I am still here.',
      'Urgent? Tell me briefly.',
      'I am here tonight.',
      'Say only what you need.',
    ],
    midday: [
      'Midday now, I am here.',
      'Take a pause, I can help.',
      'Tell me what you need.',
      'I am listening closely.',
    ],
    morning: [
      'Good morning, I am here.',
      'Need anything this morning?',
      'I am listening.',
      'Easy start, I am here.',
    ],
  },
  vi: {
    afternoon: [
      'Buổi chiều, mình ở đây.',
      'Chiều nay cần gì, cứ nói.',
      'Mình theo cùng bạn nhé.',
      'Cứ để mình nghe trước.',
    ],
    evening: [
      'Buổi tối rồi, mình ở đây.',
      'Tối nay cần gì, cứ nói nhé.',
      'Mình nghe bạn, chậm rãi thôi.',
      'Bạn cứ nói, mình hỗ trợ.',
    ],
    late: [
      'Muộn rồi, mình vẫn nghe.',
      'Cần gấp thì cứ nói nhé.',
      'Đêm muộn rồi, mình ở đây.',
      'Bạn cứ nói ngắn thôi.',
    ],
    midday: [
      'Giữa ngày rồi, mình ở đây.',
      'Trưa rồi, cứ nói với mình.',
      'Cần gì, mình nghe nhé.',
      'Bạn nghỉ chút, mình hỗ trợ.',
    ],
    morning: [
      'Chào buổi sáng, mình ở đây.',
      'Sáng nay cần gì, cứ nói nhé.',
      'Mình nghe bạn đây.',
      'Ngày mới nhẹ nhàng nhé.',
    ],
  },
}

function getVietnamTimelineParts(now = new Date()) {
  try {
    const parts = vietnamTimelineFormatter.formatToParts(now)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    if (Number.isFinite(day) && Number.isFinite(hour) && Number.isFinite(minute)) {
      return { day, hour, minute }
    }
  } catch {
    // This fallback preserves Vietnam time on runtimes without full Intl time-zone data.
  }
  return {
    day: now.getUTCDate(),
    hour: (now.getUTCHours() + 7) % 24,
    minute: now.getUTCMinutes(),
  }
}

function timelineWindow(hour: number): KaelTimelineWindow {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'late'
}

function timelineHeadline(language: AppLanguage, now = new Date()) {
  const { day, hour, minute } = getVietnamTimelineParts(now)
  const lines = kaelTimelineHeadlines[language][timelineWindow(hour)]
  return lines[(day + Math.floor(minute / 10)) % lines.length]
}

export function useKaelTimelineHeadline(language: AppLanguage) {
  const [headline, setHeadline] = useState(() => timelineHeadline(language))

  useEffect(() => {
    const updateHeadline = () => setHeadline(timelineHeadline(language))
    updateHeadline()
    const interval = setInterval(updateHeadline, kaelTimelineRefreshMs)
    return () => clearInterval(interval)
  }, [language])

  return headline
}
