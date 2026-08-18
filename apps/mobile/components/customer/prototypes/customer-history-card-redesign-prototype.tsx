import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { KaelButton } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { formatVnd } from '@/lib/format'

import { ProfileSettingsGlyph } from '../profile/profile-settings-icons'
import { useCustomerV21SurfaceTheme, V21Screen } from '../ui/shared-surfaces'

type HistoryCardVariant = 'completed' | 'cancelled'

const copy = {
  en: {
    back: 'Back',
    completed: 'Completed',
    completedBy: 'Completed by',
    detail: 'View details',
    intro: 'A calmer card that makes the state, service, and next action easier to scan.',
    prototype: 'Prototype · card direction',
    rebook: 'Rebook',
    saveWorker: 'Save worker: Worker profile',
    saveWorkerButton: 'Save worker',
    service: 'Plumbing',
    statusCancelled: 'Cancelled',
    statusCompleted: 'Completed',
    subtitle: 'Completed and cancelled states',
    support: 'Support',
    title: 'Service history',
    workerProfile: 'Worker profile',
    finalPrice: 'Final price',
    timeCompleted: '13:25',
    timeCancelled: '21:25',
  },
  vi: {
    back: 'Quay lại',
    completed: 'Đã hoàn tất',
    completedBy: 'Thợ đã thực hiện',
    detail: 'Xem chi tiết',
    intro: 'Thẻ nhẹ hơn, ưu tiên trạng thái, thông tin dịch vụ và thao tác tiếp theo.',
    prototype: 'Prototype · hướng card',
    rebook: 'Đặt lại',
    saveWorker: 'Lưu thợ: Hồ sơ thợ',
    saveWorkerButton: 'Lưu thợ',
    service: 'Sửa nước',
    statusCancelled: 'Đã hủy',
    statusCompleted: 'Đã hoàn tất',
    subtitle: 'Hai trạng thái hoàn tất và đã hủy',
    support: 'Hỗ trợ',
    title: 'Lịch sử dịch vụ',
    workerProfile: 'Hồ sơ thợ',
    workerFallback: 'Thông tin thợ chưa khả dụng.',
    finalPrice: 'Giá cuối',
    timeCompleted: '13:25',
    timeCancelled: '21:25',
  },
} satisfies Record<AppLanguage, Record<string, string>>

export function CustomerHistoryCardRedesignPrototype() {
  const router = useRouter()
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  const text = copy[language]

  return (
    <V21Screen
      frameStyle={styles.frame}
      screenId="2.6-case-overview"
      testID="customer-history-card-redesign-prototype"
    >
      <View style={styles.topBar} testID="customer-history-card-redesign-prototype-top-bar">
        <Pressable
          accessibilityLabel={text.back}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
          testID="customer-history-card-redesign-prototype-back"
        >
          <BackChevron color={tokens.primary} />
        </Pressable>
        <View style={styles.topCopy}>
          <Text style={[styles.topTitle, { color: tokens.text }]}>{text.title}</Text>
          <Text style={[styles.topSubtitle, { color: tokens.muted }]}>{text.subtitle}</Text>
        </View>
      </View>

      <View style={styles.intro} testID="customer-history-card-redesign-prototype-intro">
        <Text style={[styles.eyebrow, { color: tokens.primary }]}>{text.prototype}</Text>
        <Text style={[styles.introTitle, { color: tokens.text }]}>{language === 'vi' ? 'Rõ trạng thái hơn, nhẹ mắt hơn' : 'Clearer state, lighter surface'}</Text>
        <Text style={[styles.introBody, { color: tokens.muted }]}>{text.intro}</Text>
      </View>

      <HistoryCardPrototype
        language={language}
        text={text}
        tokens={tokens}
        variant="completed"
      />
      <HistoryCardPrototype
        language={language}
        text={text}
        tokens={tokens}
        variant="cancelled"
      />
    </V21Screen>
  )
}

function HistoryCardPrototype({
  language,
  text,
  tokens,
  variant,
}: {
  language: AppLanguage
  text: Record<string, string>
  tokens: ReturnType<typeof useCustomerV21SurfaceTheme>['tokens']
  variant: HistoryCardVariant
}) {
  const completed = variant === 'completed'
  const [savedWorker, setSavedWorker] = useState(false)
  const statusLabel = completed ? text.statusCompleted : text.statusCancelled
  const time = completed ? text.timeCompleted : text.timeCancelled
  const accessibilityLabel = `${text.service}, ${time}, ${statusLabel}`

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={`customer-history-card-redesign-prototype-${variant}`}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View
            style={[styles.stateMark, { backgroundColor: tokens.raised, borderColor: completed ? tokens.text : tokens.border }]}
            testID={`customer-history-card-redesign-prototype-${variant}-state-mark`}
          >
            {completed ? <CompletedMark color={tokens.text} /> : <CancelledMark color={tokens.muted} />}
          </View>
          <View style={styles.metaCopy}>
            <Text style={[styles.serviceMeta, { color: tokens.muted }]}>{text.service} · {time}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: completed ? tokens.service : tokens.raised, borderColor: completed ? tokens.primary : tokens.border }]} testID={`customer-history-card-redesign-prototype-${variant}-status`}>
            <Text style={[styles.statusText, { color: completed ? tokens.primary : tokens.muted }]}>{statusLabel}</Text>
          </View>
        </View>

        {completed ? (
          <View style={styles.workerRow} testID="customer-history-card-redesign-prototype-completed-worker">
            <View
              style={[styles.workerAvatar, { backgroundColor: tokens.raised, borderColor: tokens.text }]}
              testID="customer-history-card-redesign-prototype-completed-avatar"
            >
              <ProfileSettingsGlyph
                color={tokens.text}
                name="personal"
                testID="customer-history-card-redesign-prototype-completed-avatar-placeholder-icon"
              />
            </View>
            <View style={styles.workerCopy}>
              <Text style={[styles.workerName, { color: tokens.text }]}>{text.workerProfile}</Text>
              <Text style={[styles.workerEyebrow, { color: tokens.muted }]}>{text.completedBy}</Text>
            </View>
            <Pressable
              accessibilityLabel={text.saveWorker}
              accessibilityRole="button"
              accessibilityState={{ selected: savedWorker }}
              onPress={() => setSavedWorker((current) => !current)}
              style={[styles.favoriteButton, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
              testID="customer-history-card-redesign-prototype-completed-favorite"
            >
              <StarMark filled={savedWorker} fill={tokens.service} outline={tokens.primary} />
              <Text style={[styles.favoriteLabel, { color: tokens.primary }]}>{text.saveWorkerButton}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.divider, { backgroundColor: tokens.border }]} />

        <View style={styles.footer}>
          {completed ? (
            <View style={styles.priceBlock} testID="customer-history-card-redesign-prototype-completed-price">
              <Text style={[styles.priceLabel, { color: tokens.muted }]}>{text.finalPrice}</Text>
              <Text style={[styles.priceValue, { color: tokens.text }]}>{formatVnd(800_000, language)}</Text>
            </View>
          ) : <View style={styles.priceBlock} />}

          {completed ? (
            <View style={styles.actionRow}>
              <KaelButton
                label={text.rebook}
                onPress={() => undefined}
                size="small"
                style={styles.actionButton}
                testID="customer-history-card-redesign-prototype-completed-rebook"
                variant="secondary"
              />
              <KaelButton
                label={text.support}
                onPress={() => undefined}
                size="small"
                style={styles.actionButton}
                testID="customer-history-card-redesign-prototype-completed-support"
                variant="ghost"
              />
            </View>
          ) : (
            <KaelButton
              label={text.detail}
              onPress={() => undefined}
              size="small"
              style={styles.detailButton}
              testID="customer-history-card-redesign-prototype-cancelled-detail"
              variant="secondary"
            />
          )}
        </View>
      </View>
    </View>
  )
}

function BackChevron({ color }: { color: string }) {
  return (
    <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
      <Path d="M15 5 8 12l7 7" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.7} />
    </Svg>
  )
}

function CompletedMark({ color }: { color: string }) {
  return (
    <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
      <Circle cx={12} cy={12} r={8.7} stroke={color} strokeWidth={1.8} />
      <Path d="m8.3 12.1 2.5 2.5 5-5.1" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  )
}

function CancelledMark({ color }: { color: string }) {
  return (
    <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
      <Circle cx={12} cy={12} r={8.7} stroke={color} strokeWidth={1.8} />
      <Path d="M8.5 12h7" stroke={color} strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  )
}

function StarMark({ filled, fill, outline }: { filled: boolean; fill: string; outline: string }) {
  return (
    <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
      <Path
        d="M12 2.9 14.83 8.64l6.34.92-4.59 4.48 1.08 6.32L12 17.38l-5.66 2.98 1.08-6.32-4.59-4.48 6.34-.92L12 2.9Z"
        fill={filled ? fill : 'none'}
        stroke={outline}
        strokeLinejoin="round"
        strokeWidth={filled ? 1.5 : 0.8}
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  actionButton: {
    minHeight: 44,
    minWidth: 80,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'flex-end',
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  cardContent: {
    gap: 14,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  detailButton: {
    minHeight: 44,
    minWidth: 118,
  },
  eyebrow: {
    ...typography.caption1,
    fontWeight: '700',
  },
  favoriteButton: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    justifyContent: 'center',
    minWidth: 84,
    paddingHorizontal: 11,
  },
  favoriteLabel: {
    ...typography.caption1,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  frame: {
    alignSelf: 'center',
    gap: 0,
    maxWidth: 560,
    width: '100%',
  },
  intro: {
    gap: 4,
    marginTop: 12,
  },
  introBody: {
    ...typography.subheadline,
    lineHeight: 20,
  },
  introTitle: {
    ...typography.title3,
    fontWeight: '700',
  },
  metaCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 8,
  },
  priceBlock: {
    flex: 1,
    minHeight: 44,
  },
  priceLabel: {
    ...typography.caption1,
    fontWeight: '600',
  },
  priceValue: {
    ...typography.headline,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  serviceMeta: {
    ...typography.footnote,
    fontWeight: '600',
  },
  stateMark: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  statusPill: {
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusText: {
    ...typography.caption1,
    fontWeight: '700',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
  },
  topCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  topSubtitle: {
    ...typography.footnote,
    fontWeight: '600',
  },
  topTitle: {
    ...typography.title2,
    fontWeight: '600',
  },
  workerAvatar: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  workerCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  workerEyebrow: {
    ...typography.caption1,
    fontWeight: '600',
  },
  workerName: {
    ...typography.callout,
    fontWeight: '600',
  },
  workerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
})
