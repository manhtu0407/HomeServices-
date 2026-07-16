import type { ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon, type WorkerV5IntegratedIconTone } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail, type WorkerV5DetailRailItem } from '../ui/worker-v5-detail-rail'
import { styles } from './settings-styles'

type WorkerV5SettingsAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SettingsHero({
  language,
  listAura: _listAura,
  reduceTransparency,
  settingsIcon,
}: {
  language: AppLanguage
  listAura: WorkerV5SettingsAura
  reduceTransparency: boolean
  settingsIcon: ImageSourcePropType
}) {
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-settings-hero">
      <WorkerV5IntegratedIcon bleed={18} image={settingsIcon} reduceTransparency={reduceTransparency} tone="identity" variant="heroPanel" />
      <View style={[styles.earningsHeroCopy, styles.settingsHeroCopy]}>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-settings-title">{textByLanguage(language, 'Cài đặt tài khoản', 'Account settings')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>
          {textByLanguage(language, 'Bảo mật, ngôn ngữ và dữ liệu Kael.', 'Security, language, and Kael data.')}
        </Text>
        <WorkerV5DetailRail
          items={[
            { glyph: 'identity', label: textByLanguage(language, 'Tài khoản', 'Account') },
            { glyph: 'shield', label: textByLanguage(language, 'Bảo mật', 'Security') },
            { glyph: 'memory', label: textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory') },
          ]}
          testID="worker-v5-settings-hero-detail"
        />
      </View>
    </View>
  )
}

export function WorkerV5SettingsActionRow({
  body,
  details,
  icon,
  listAura: _listAura,
  onPress,
  reduceTransparency,
  status,
  testID,
  tone,
  title,
}: {
  body: string
  details: readonly WorkerV5DetailRailItem[]
  icon: ImageSourcePropType
  listAura: WorkerV5SettingsAura
  onPress: () => void
  reduceTransparency: boolean
  status: string
  testID: string
  tone: WorkerV5IntegratedIconTone
  title: string
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.workerSettingsActionRow, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <WorkerV5IntegratedIcon bleed={12} image={icon} reduceTransparency={reduceTransparency} tone={tone} variant="panel" />
      <View style={styles.workerSettingsActionCopy}>
        <Text style={styles.workerSettingsActionTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.workerSettingsActionBody} numberOfLines={2}>{body}</Text>
        <WorkerV5DetailRail items={details} testID={`${testID}-detail`} />
      </View>
      <View style={[styles.workerSettingsStatusPill, reduceTransparency && styles.opaqueCard]}>
        <Text style={styles.workerSettingsStatusText} numberOfLines={1}>{status}</Text>
      </View>
    </Pressable>
  )
}

export function WorkerV5ReadOnlyToggleList({
  items,
  reduceTransparency,
}: {
  items: readonly { enabled: boolean; label: string; value: string }[]
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.toggleList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-toggle-list">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={styles.toggleRow} testID={`worker-v5-toggle-row-${index}`}>
          <View style={styles.toggleTextColumn}>
            <Text style={styles.toggleLabel} numberOfLines={2} testID={`worker-v5-toggle-label-${index}`}>{item.label}</Text>
            <Text style={styles.toggleValue} numberOfLines={2} testID={`worker-v5-toggle-value-${index}`}>{item.value}</Text>
          </View>
          <View
            accessibilityRole="switch"
            accessibilityState={{ checked: item.enabled, disabled: true }}
            style={[styles.toggleTrack, item.enabled ? styles.toggleTrackOn : null]}
            testID={`worker-v5-toggle-track-${index}`}
          >
            <View style={[styles.toggleKnob, item.enabled ? styles.toggleKnobOn : null]} />
          </View>
        </View>
      ))}
    </View>
  )
}
