import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LocalCompletionNudge } from '@nestscout/shared'

import { KaelButton } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { WorkerReportButton } from '../report/worker-report-entry'
import type { CustomerThemeTokens } from '../customer-theme'
import { formatShortClockTime } from './case-work-money-display-model'

const MINUTE_MS = 60_000

// Whether the button is live now. The server's answer can be a cooldown that has since run out, so a
// passed window counts as open here; the server still checks again when the button is pressed.
export function completionNudgeOpen(nudge: LocalCompletionNudge, now: number) {
  if (nudge.canNudge) return true
  if (nudge.reason !== 'COOLDOWN' && nudge.reason !== 'TOO_EARLY') return false
  const next = Date.parse(nudge.nextAvailableAt ?? '')
  return Number.isFinite(next) && now >= next
}

export function completionNudgeNote(nudge: LocalCompletionNudge, now: number, language: AppLanguage) {
  const vi = language === 'vi'
  const last = formatShortClockTime(nudge.lastNudgedAt, language)
  const next = Date.parse(nudge.nextAvailableAt ?? '')
  const minutes = Number.isFinite(next) ? Math.max(1, Math.ceil((next - now) / MINUTE_MS)) : null
  if (completionNudgeOpen(nudge, now)) {
    if (nudge.used === 0) {
      return vi
        ? 'Thợ sẽ nhận thông báo nhắc báo hoàn tất. Công việc vẫn tiếp tục bình thường.'
        : 'The worker gets a reminder to report the work done. The job carries on as usual.'
    }
    return vi ? `Đã nhắc ${nudge.used}/${nudge.maxAllowed} lần, gần nhất lúc ${last}.` : `Reminded ${nudge.used}/${nudge.maxAllowed} times, last at ${last}.`
  }
  switch (nudge.reason) {
    case 'COOLDOWN':
      return vi
        ? `Đã nhắc thợ lúc ${last}. Có thể nhắc lại sau ${minutes ?? 1} phút.`
        : `You reminded the worker at ${last}. You can remind again in ${minutes ?? 1} min.`
    case 'TOO_EARLY':
      return vi
        ? `Thợ mới bắt đầu làm. Có thể nhắc sau khoảng ${minutes ?? 1} phút.`
        : `The worker has only just started. You can remind in about ${minutes ?? 1} min.`
    case 'WORK_PAUSED':
      return vi ? 'Thợ đang tạm dừng công việc nên chưa thể nhắc.' : 'The worker has paused the work, so a reminder is not available.'
    case 'LIMIT_REACHED':
      return vi
        ? `Bạn đã nhắc đủ ${nudge.maxAllowed} lần. Nếu cần, hãy báo cáo thợ.`
        : `You have used all ${nudge.maxAllowed} reminders. Report the worker if you need to.`
    default:
      return null
  }
}

// While the worker is repairing the customer cannot end the job, but can ask Kael to remind the worker
// to report it done. The reminder sits beside the report entry and says why it is or is not available.
export function CompletionNudgeControls({ jobId, language, nudge, onNudge, secondaryActionStyle, tokens }: {
  jobId: string
  language: AppLanguage
  nudge: LocalCompletionNudge
  onNudge: () => Promise<boolean>
  secondaryActionStyle: object
  tokens: CustomerThemeTokens
}) {
  const vi = language === 'vi'
  const [now, setNow] = useState(() => Date.now())
  const [sending, setSending] = useState(false)

  // Wake at the moment the window opens, and otherwise once a minute so "after N min" counts down.
  useEffect(() => {
    const next = Date.parse(nudge.nextAvailableAt ?? '')
    const untilOpen = Number.isFinite(next) ? next - Date.now() : MINUTE_MS
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(untilOpen, 1000) + 250, MINUTE_MS))
    return () => clearTimeout(timer)
  }, [now, nudge.nextAvailableAt])

  const open = completionNudgeOpen(nudge, now)
  const note = completionNudgeNote(nudge, now, language)
  const press = () => {
    if (!open || sending) return
    setSending(true)
    void Promise.resolve().then(onNudge).catch(() => false).finally(() => {
      setSending(false)
      setNow(Date.now())
    })
  }
  return (
    <View style={styles.stack} testID="customer-v21-completion-nudge">
      <View style={styles.row}>
        <KaelButton
          accessibilityState={{ busy: sending, disabled: !open || sending }}
          disabled={!open || sending}
          label={sending ? (vi ? 'Đang gửi' : 'Sending') : (vi ? 'Nhắc thợ báo xong' : 'Remind worker')}
          onPress={press}
          size="small"
          style={secondaryActionStyle}
          testID="customer-v21-completion-nudge-send"
          variant="secondary"
        />
        <WorkerReportButton
          jobId={jobId}
          language={language}
          style={secondaryActionStyle}
          testID="customer-v21-case-work-report-worker"
        />
      </View>
      {note ? (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: tokens.muted }]} testID="customer-v21-completion-nudge-note">
          {note}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  note: { ...typography.footnote },
  row: { columnGap: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  stack: { alignSelf: 'stretch', gap: 12 },
})
