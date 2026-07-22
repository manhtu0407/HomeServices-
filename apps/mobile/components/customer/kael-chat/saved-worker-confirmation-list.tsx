import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import type { SavedWorkerSummary, SavedWorkersStatus } from './customer-saved-workers'

export function SavedWorkerConfirmationList({
  candidateWorkerId,
  emptyMessage,
  language,
  onRetry,
  status,
  tokens,
  workers,
}: {
  candidateWorkerId: string
  emptyMessage?: string
  language: AppLanguage
  onRetry: () => void
  status: SavedWorkersStatus
  tokens: CustomerThemeTokens
  workers: readonly SavedWorkerSummary[]
}) {
  if (status === 'loading') {
    return (
      <View style={styles.state} testID="customer-v21-worker-candidate-saved-loading">
        <ActivityIndicator color={tokens.primary} />
        <Text style={[styles.body, { color: tokens.muted }]}>
          {language === 'vi' ? 'Đang tải thợ đã lưu…' : 'Loading saved workers…'}
        </Text>
      </View>
    )
  }
  if (status === 'error') {
    return (
      <View style={styles.error} testID="customer-v21-worker-candidate-saved-error">
        <Text style={[styles.body, { color: tokens.muted }]}>
          {language === 'vi' ? 'Chưa tải được danh sách thợ đã lưu.' : 'The saved-worker list is unavailable.'}
        </Text>
        <KaelButton
          label={language === 'vi' ? 'Thử lại' : 'Try again'}
          onPress={onRetry}
          size="small"
          testID="customer-v21-worker-candidate-saved-retry"
          variant="secondary"
        />
      </View>
    )
  }
  if (workers.length === 0) {
    return (
      <Text style={[styles.empty, { color: tokens.muted }]} testID="customer-v21-worker-candidate-saved-empty">
        {emptyMessage ?? (language === 'vi' ? 'Bạn chưa lưu thợ nào trong Hoạt động.' : 'You have not saved a worker in Activity yet.')}
      </Text>
    )
  }

  const visibleWorkers = workers.slice(0, 3)
  return (
    <View style={styles.list} testID="customer-v21-worker-candidate-saved-list">
      {visibleWorkers.map((worker) => {
        const workerName = worker.displayName || (language === 'vi' ? 'Hồ sơ thợ đã lưu' : 'Saved worker profile')
        return (
          <View key={worker.id} style={styles.worker}>
            <Text style={[styles.check, { color: tokens.primary }]}>✓</Text>
            <Text numberOfLines={1} style={[styles.workerName, { color: tokens.text }]}>{workerName}</Text>
            <Text style={[styles.stateLabel, { color: tokens.muted }]}>
              {worker.id === candidateWorkerId
                ? (language === 'vi' ? 'Đang chọn' : 'Selected')
                : (language === 'vi' ? 'Đã lưu' : 'Saved')}
            </Text>
          </View>
        )
      })}
      {workers.length > visibleWorkers.length ? (
        <Text style={[styles.more, { color: tokens.muted }]}>
          {language === 'vi'
            ? `Còn ${workers.length - visibleWorkers.length} thợ khác trong Hoạt động.`
            : `${workers.length - visibleWorkers.length} more saved in Activity.`}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 12, lineHeight: 18 },
  check: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 12, lineHeight: 18, paddingVertical: 4 },
  error: { gap: 9 },
  list: { gap: 7 },
  more: { fontSize: 11, lineHeight: 17 },
  state: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  stateLabel: { fontSize: 11, fontWeight: '600' },
  worker: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 32 },
  workerName: { flex: 1, fontSize: 13, fontWeight: '700' },
})
