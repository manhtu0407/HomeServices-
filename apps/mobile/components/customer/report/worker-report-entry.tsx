import type { LocalDealStatus } from '@nestscout/shared'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelButton } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ServiceHistoryStyles as historyStyles } from '../history/service-history-styles'
import { WorkerReportSheet } from './worker-report-sheet'

// Statuses where a worker is attached to the job and may be at the apartment. The server
// accepts a report for any job with a worker; ended jobs are reported from history instead.
const WORKER_AT_WORK_STATUSES = new Set<LocalDealStatus>([
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'payment_pending',
])

export function isWorkerAtWorkStatus(status: LocalDealStatus | null | undefined): boolean {
  return Boolean(status && WORKER_AT_WORK_STATUSES.has(status))
}

export function WorkerReportButton({ jobId, language, testID }: { jobId: string; language: AppLanguage; testID: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <KaelButton
        label={language === 'vi' ? 'Báo cáo thợ' : 'Report the worker'}
        onPress={() => setOpen(true)}
        size="small"
        testID={testID}
        variant="ghost"
      />
      {open ? <WorkerReportSheet jobId={jobId} language={language} onClose={() => setOpen(false)} visible /> : null}
    </>
  )
}

export type ActiveWorkSummary = {
  jobId: string
  serviceLabel: string
  statusLabel: string
  workerName: string | null
  onOpen: () => void
}

function WrenchMark({ color }: { color: string }) {
  return (
    <Svg height={19} viewBox="0 0 24 24" width={19}>
      <Path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
      />
    </Svg>
  )
}

function Chevron({ color, open }: { color: string; open: boolean }) {
  return (
    <Svg height={16} viewBox="0 0 24 24" width={16}>
      <Path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  )
}

// A one-line entry in the same shape as the saved-workers row; the full card, with the report
// button, opens only when the customer asks for it, so the history list stays calm.
export function ActiveWorkEntry({ language, summary, tokens }: { language: AppLanguage; summary: ActiveWorkSummary; tokens: CustomerThemeTokens }) {
  const [open, setOpen] = useState(false)
  const vi = language === 'vi'
  const detail = [summary.serviceLabel, summary.workerName, summary.statusLabel].filter(Boolean).join(' · ')
  return (
    <View>
      <Pressable
        accessibilityHint={vi ? 'Mở để xem công việc và báo cáo thợ' : 'Opens the job and the worker report'}
        accessibilityLabel={`${vi ? 'Thợ đang làm' : 'Worker on the job'}. ${detail}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [historyStyles.savedWorkerHint, { backgroundColor: tokens.raised, borderColor: tokens.border }, pressed && styles.pressed]}
        testID="customer-v21-history-active-work-entry"
      >
        <View style={[historyStyles.savedWorkerHintContent, styles.entryRow]}>
          <View style={[historyStyles.savedWorkerHintIconTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <WrenchMark color={tokens.primary} />
          </View>
          <View style={historyStyles.savedWorkerHintCopy}>
            <Text style={[historyStyles.savedWorkerHintTitle, { color: tokens.text }]}>{vi ? 'Thợ đang làm' : 'Worker on the job'}</Text>
            <Text numberOfLines={1} style={[historyStyles.savedWorkerHintText, { color: tokens.muted }]}>{detail}</Text>
          </View>
          <Chevron color={tokens.muted} open={open} />
        </View>
      </Pressable>
      {open ? <ActiveWorkCard language={language} summary={summary} tokens={tokens} /> : null}
    </View>
  )
}

// The history list only holds ended jobs; the job a worker is on right now sits above it so a
// customer can reach the report without opening Kael first.
export function ActiveWorkCard({ language, summary, tokens }: { language: AppLanguage; summary: ActiveWorkSummary; tokens: CustomerThemeTokens }) {
  return (
    <View
      accessibilityLabel={`${language === 'vi' ? 'Thợ đang làm' : 'Worker on the job'}. ${summary.serviceLabel}. ${summary.statusLabel}`}
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID="customer-v21-history-active-work"
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: tokens.muted }]}>{language === 'vi' ? 'Thợ đang làm' : 'Worker on the job'}</Text>
        <View style={[styles.pill, { backgroundColor: tokens.service, borderColor: tokens.primary }]}>
          <Text style={[styles.pillText, { color: tokens.primary }]}>{summary.statusLabel}</Text>
        </View>
      </View>
      <Text style={[styles.title, { color: tokens.text }]}>{summary.serviceLabel}</Text>
      {summary.workerName ? <Text style={[styles.meta, { color: tokens.muted }]}>{summary.workerName}</Text> : null}
      <View style={styles.actions}>
        <KaelButton label={language === 'vi' ? 'Mở công việc' : 'Open work'} onPress={summary.onOpen} size="small" style={styles.action} testID="customer-v21-history-active-work-open" variant="secondary" />
        <WorkerReportButton jobId={summary.jobId} language={language} testID="customer-v21-history-active-work-report" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  entryRow: {
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    marginTop: 8,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...typography.caption1,
    fontWeight: '600',
  },
  pill: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: {
    ...typography.caption1,
    fontWeight: '600',
  },
  title: {
    ...typography.headline,
  },
  meta: {
    ...typography.footnote,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  action: {
    flexShrink: 1,
  },
})
