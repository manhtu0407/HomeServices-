import { Image } from 'expo-image'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerCandidateView } from '@/lib/api-types'
import type { CustomerThemeTokens } from '../customer-theme'
import { V21Card } from '../v21/shared-surfaces'

export function WorkerCandidateReviewCard({
  busy,
  candidate,
  error,
  language,
  onConfirm,
  onReject,
  onRetry,
  onToggleFavorite,
  tokens,
}: {
  busy: boolean
  candidate: WorkerCandidateView | null
  error: string | null
  language: AppLanguage
  onConfirm: () => void
  onReject: () => void
  onRetry: () => void
  onToggleFavorite: (isFavorite: boolean) => void
  tokens: CustomerThemeTokens
}) {
  const title = language === 'vi' ? 'Thợ phù hợp đang chờ bạn xác nhận' : 'A matched worker is waiting for your review'
  const displayName = candidate?.display_name?.trim() || (language === 'vi' ? 'Hồ sơ thợ' : 'Worker profile')
  const verified = candidate?.verification_status === 'approved'
  const facts = candidate ? candidateFacts(candidate, language) : []

  return (
    <V21Card
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID="customer-v21-worker-candidate-review"
    >
      <View style={styles.header}>
        {candidate?.avatar_url ? (
          <Image accessibilityIgnoresInvertColors source={{ uri: candidate.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: tokens.service }]}>
            <Text style={[styles.avatarText, { color: tokens.primary }]}>{initials(displayName)}</Text>
          </View>
        )}
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: tokens.primary }]}>{language === 'vi' ? 'Cần quyết định của bạn' : 'Your decision is required'}</Text>
          <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
        </View>
      </View>

      {!candidate && busy ? (
        <View style={styles.loading} testID="customer-v21-worker-candidate-loading">
          <ActivityIndicator color={tokens.primary} />
          <Text style={[styles.body, { color: tokens.muted }]}>{language === 'vi' ? 'Đang tải hồ sơ an toàn' : 'Loading the safe profile'}</Text>
        </View>
      ) : null}

      {candidate ? (
        <>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: tokens.text }]}>{displayName}</Text>
            {candidate.is_favorite ? (
              <Text
                style={[styles.favorite, { backgroundColor: tokens.service, color: tokens.primary }]}
                testID="customer-v21-worker-candidate-favorite"
              >
                {language === 'vi' ? 'Thợ bạn yêu thích' : 'Your favorite worker'}
              </Text>
            ) : null}
            {verified ? (
              <Text style={[styles.verified, { backgroundColor: tokens.service, color: tokens.primary }]}>
                {language === 'vi' ? 'Đã xác minh' : 'Verified'}
              </Text>
            ) : null}
          </View>
          {facts.length > 0 ? (
            <View accessibilityLabel={facts.join(', ')} style={styles.facts} testID="customer-v21-worker-candidate-facts">
              {facts.map((fact) => (
                <Text key={fact} style={[styles.fact, { backgroundColor: tokens.service, color: tokens.text }]}>{fact}</Text>
              ))}
            </View>
          ) : (
            <Text style={[styles.body, { color: tokens.muted }]}>
              {language === 'vi' ? 'Chưa có lịch sử công việc đủ để hiển thị thêm.' : 'There is not enough completed-job history to show more yet.'}
            </Text>
          )}
          <Text style={[styles.privacy, { color: tokens.muted }]} testID="customer-v21-worker-candidate-address-lock">
            {language === 'vi'
              ? 'Địa chỉ chi tiết vẫn được khóa cho tới khi bạn chọn thợ này.'
              : 'Your detailed address stays locked until you choose this worker.'}
          </Text>
          <KaelButton
            accessibilityState={{ disabled: busy, selected: candidate.is_favorite }}
            disabled={busy}
            label={candidate.is_favorite
              ? (language === 'vi' ? 'Bỏ lưu thợ này' : 'Remove saved worker')
              : (language === 'vi' ? 'Lưu thợ yêu thích' : 'Save favorite worker')}
            onPress={() => onToggleFavorite(!candidate.is_favorite)}
            size="small"
            testID="customer-v21-worker-candidate-favorite-toggle"
            variant="secondary"
          />
        </>
      ) : null}

      {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: tokens.primary }]}>{error}</Text> : null}
      {!candidate && !busy ? (
        <KaelButton
          label={language === 'vi' ? 'Tải lại' : 'Retry'}
          onPress={onRetry}
          size="small"
          testID="customer-v21-worker-candidate-retry"
          variant="secondary"
        />
      ) : null}
      {candidate?.status === 'proposed' ? (
        <View style={styles.actions}>
          <KaelButton
            disabled={busy}
            label={language === 'vi' ? 'Tìm thợ khác' : 'Find another worker'}
            onPress={onReject}
            size="small"
            style={styles.action}
            testID="customer-v21-worker-candidate-reject"
            variant="secondary"
          />
          <KaelButton
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            label={busy ? (language === 'vi' ? 'Đang xử lý' : 'Processing') : (language === 'vi' ? 'Chọn thợ này' : 'Choose this worker')}
            onPress={onConfirm}
            size="small"
            style={styles.action}
            testID="customer-v21-worker-candidate-confirm"
          />
        </View>
      ) : null}
    </V21Card>
  )
}

function candidateFacts(candidate: WorkerCandidateView, language: AppLanguage) {
  const facts: string[] = []
  if (candidate.rating !== null && candidate.total_jobs > 0) {
    facts.push(`${candidate.rating.toFixed(1)} ★`)
  }
  if (candidate.total_jobs > 0) {
    facts.push(language === 'vi' ? `${candidate.total_jobs} việc đã hoàn tất` : `${candidate.total_jobs} completed jobs`)
  }
  if (candidate.years_experience > 0) {
    facts.push(language === 'vi' ? `${candidate.years_experience} năm kinh nghiệm` : `${candidate.years_experience} years experience`)
  }
  return facts
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('') || 'NS'
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  card: { gap: 13, marginTop: 10 },
  error: { fontSize: 12, lineHeight: 18 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.45, textTransform: 'uppercase' },
  fact: { borderRadius: 14, fontSize: 12, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6 },
  favorite: { borderRadius: 12, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  name: { flex: 1, fontSize: 17, fontWeight: '700' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  privacy: { fontSize: 12, lineHeight: 18 },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  verified: { borderRadius: 12, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
})
