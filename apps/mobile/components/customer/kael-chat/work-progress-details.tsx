import { useEffect, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { formatShortClockTime, formatVnd } from './case-work-money-display-model'
import { CaseWorkReceipt, CaseWorkReceiptLine } from './case-work-receipt-line'
import { elapsedSeconds, formatElapsedClock, msToNextSecond } from './work-progress-model'

// Re-reads the clock on each whole second while it is running, and again when the app returns to the
// foreground, because timers are throttled in the background and would leave the figure behind.
function useSecondClock(running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, msToNextSecond(Date.now()))
    }
    setNow(Date.now())
    schedule()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now())
    })
    return () => {
      if (timer) clearTimeout(timer)
      subscription.remove()
    }
  }, [running])
  return now
}

// What the customer can see while the worker is on site, taken only from what the job reports. While
// inspecting the only real mark is the arrival; the work clock starts when the worker begins the repair.
export function WorkProgressDetails({ deal, language, phase, tokens }: {
  deal: LocalDeal
  language: AppLanguage
  phase: 'inspecting' | 'repairing'
  tokens: CustomerThemeTokens
}) {
  const vi = language === 'vi'
  const inspecting = phase === 'inspecting'
  const paused = !inspecting && Boolean(deal.workPausedAt)
  const startedAt = inspecting ? deal.arrivedAt : deal.workStartedAt
  const now = useSecondClock(Boolean(startedAt) && !paused)
  const elapsed = elapsedSeconds({
    now,
    pausedAt: inspecting ? null : deal.workPausedAt,
    pausedMs: inspecting ? 0 : deal.workPausedMs,
    startedAt,
  })
  const startClock = formatShortClockTime(startedAt, language)
  const note = inspecting ? null : deal.workerWorkNote?.trim() || null
  const price = typeof deal.finalPrice === 'number' ? formatVnd(deal.finalPrice, language) : null
  const workerName = deal.workerProfile?.fullName ?? null

  const lines: { label: string; value: string }[] = []
  if (workerName) lines.push({ label: vi ? (inspecting ? 'Thợ kiểm tra' : 'Thợ thi công') : (inspecting ? 'Inspecting' : 'Working'), value: workerName })
  if (startClock) {
    lines.push({
      label: inspecting ? (vi ? 'Thợ có mặt lúc' : 'Worker arrived at') : (vi ? 'Bắt đầu thi công lúc' : 'Work started at'),
      value: startClock,
    })
  }
  if (elapsed !== null) {
    lines.push({
      label: inspecting
        ? (vi ? 'Đã ở hiện trường' : 'On site for')
        : paused ? (vi ? 'Đã làm (đang tạm dừng)' : 'Worked (paused)') : (vi ? 'Đã làm' : 'Worked'),
      value: formatElapsedClock(elapsed),
    })
  }
  if (price) lines.push({ label: vi ? 'Giá đã chốt' : 'Agreed price', value: price })

  if (lines.length === 0 && !note) return null
  return (
    <View style={styles.root} testID={`customer-v21-work-progress-${phase}`}>
      {note ? (
        <View style={styles.note} testID="customer-v21-work-progress-note">
          <Text style={[styles.noteLabel, { color: tokens.muted }]}>{vi ? 'Thợ ghi chú' : 'Worker note'}</Text>
          <Text style={[styles.noteText, { color: tokens.text }]}>{note}</Text>
        </View>
      ) : null}
      {lines.length > 0 ? (
        <CaseWorkReceipt tokens={tokens}>
          {lines.map((line) => <CaseWorkReceiptLine key={line.label} label={line.label} tokens={tokens} value={line.value} />)}
        </CaseWorkReceipt>
      ) : null}
      {inspecting ? null : (
        <Text style={[styles.next, { color: tokens.muted }]} testID="customer-v21-work-progress-next">
          {vi
            ? 'Khi thợ báo xong việc, bạn sẽ kiểm tra kết quả và xác nhận hoàn tất ở bước tiếp theo.'
            : 'When the worker reports the work done, you review the result and confirm completion in the next step.'}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  next: { ...typography.footnote },
  note: { gap: 4 },
  noteLabel: { ...typography.footnote },
  noteText: { ...typography.body },
  root: { gap: 18 },
})
