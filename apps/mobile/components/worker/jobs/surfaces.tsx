import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import type { WorkerV5SchedulePlanRow } from './schedule'
import { styles } from './styles'

type WorkerV5AuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ScheduleList({
  reduceTransparency,
  rows,
}: {
  reduceTransparency: boolean
  rows: readonly WorkerV5SchedulePlanRow[]
}) {
  return (
    <View style={styles.scheduleList} testID="worker-v5-schedule-list">
      {rows.map((row) => (
        <View key={`${row.time}-${row.title}-${row.meta}`} style={[styles.scheduleRow, reduceTransparency && styles.opaqueCard]} testID="worker-v5-schedule-row">
          <Text style={styles.scheduleTime} numberOfLines={1}>{row.time}</Text>
          <View style={styles.scheduleTextColumn}>
            <Text style={styles.scheduleTitle} numberOfLines={1}>{row.title}</Text>
            <Text style={styles.scheduleMeta} numberOfLines={1}>{row.meta}</Text>
          </View>
          <Text style={styles.scheduleAside} numberOfLines={1}>{row.aside}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5ScheduleEmptyState({
  calendarIcon,
  caseWideAura: CaseWideAura,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  calendarIcon: ImageSourcePropType
  caseWideAura: WorkerV5AuraComponent
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5AuraComponent
}) {
  return (
    <View style={[styles.scheduleEmptyCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-schedule-empty-state">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="SmartScheduleEmptyWide" style={styles.scheduleEmptyAura} testID="worker-v5-schedule-empty-mint-aura" />
          <ZipAura scope="SmartScheduleEmptyFine" style={styles.scheduleEmptyZipAura} testID="worker-v5-schedule-empty-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.scheduleEmptyIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={calendarIcon} style={styles.scheduleEmptyIcon} />
      </View>
      <View style={styles.scheduleEmptyText}>
        <Text style={styles.scheduleEmptyTitle} numberOfLines={2}>
          {textByLanguage(language, 'Chưa có lịch tối ưu thật', 'No real optimized schedule yet')}
        </Text>
        <Text style={styles.scheduleEmptyMeta} numberOfLines={3}>
          {textByLanguage(
            language,
            'Lịch trình sẽ tự hiện khi có cơ hội thật từ khách hoặc việc đang chạy.',
            'The schedule appears when there is a real customer opportunity or active work.',
          )}
        </Text>
      </View>
    </View>
  )
}

export function WorkerV5ScheduleActionRow({
  onCustomize,
  onUseSchedule,
  primary,
  primaryFill: PrimaryFill,
  reduceTransparency,
  secondary,
}: {
  onCustomize: () => void
  onUseSchedule: () => void
  primary: string
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  secondary: string
}) {
  return (
    <View accessibilityRole="summary" style={styles.scheduleActionRow} testID="worker-v5-schedule-action-row">
      <Pressable
        accessibilityRole="button"
        onPress={onCustomize}
        style={({ pressed }) => [
          styles.scheduleActionButton,
          styles.scheduleActionSecondary,
          reduceTransparency && styles.opaqueCard,
          pressed ? styles.pressed : null,
        ]}
        testID="worker-v5-schedule-customize"
      >
        <Text style={styles.scheduleActionSecondaryText} numberOfLines={1}>{secondary}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onUseSchedule}
        style={({ pressed }) => [
          styles.scheduleActionButton,
          styles.scheduleActionPrimary,
          reduceTransparency && styles.opaqueCard,
          pressed ? styles.pressed : null,
        ]}
        testID="worker-v5-schedule-use"
      >
        {!reduceTransparency ? <PrimaryFill disabled={false} variant="source" /> : null}
        <Text style={[styles.scheduleActionPrimaryText, reduceTransparency && styles.actionRailPrimaryText]} numberOfLines={1}>{primary}</Text>
      </Pressable>
    </View>
  )
}
