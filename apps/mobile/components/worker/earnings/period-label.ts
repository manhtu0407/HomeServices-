import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import type { WorkerEarningsPeriod } from './overview-model'

export function workerEarningsPeriodLabel(period: WorkerEarningsPeriod, language: AppLanguage) {
  const labels = {
    day: textByLanguage(language, 'Ngày', 'Day'),
    month: textByLanguage(language, 'Tháng', 'Month'),
    week: textByLanguage(language, 'Tuần', 'Week'),
    year: textByLanguage(language, 'Năm', 'Year'),
  }
  return labels[period]
}
