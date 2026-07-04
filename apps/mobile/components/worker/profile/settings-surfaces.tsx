import type { ComponentType } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { styles } from './settings-styles'

type WorkerV5SettingsAura = ComponentType<{ testID: string }>
type WorkerV5SettingsIcons = Record<WorkerV5IconName, ImageSourcePropType>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SettingsHero({
  language,
  listAura: ListAura,
  reduceTransparency,
  shieldIcon,
}: {
  language: AppLanguage
  listAura: WorkerV5SettingsAura
  reduceTransparency: boolean
  shieldIcon: ImageSourcePropType
}) {
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-settings-hero">
      {!reduceTransparency ? <ListAura testID="worker-v5-settings-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={shieldIcon} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-settings-title">{textByLanguage(language, 'Cài đặt tài khoản', 'Account settings')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>
          {textByLanguage(language, 'Bảo mật, ngôn ngữ và dữ liệu Kael.', 'Security, language, and Kael data.')}
        </Text>
      </View>
    </View>
  )
}

export function WorkerV5SettingsActionRow({
  body,
  icon,
  icons,
  listAura: ListAura,
  onPress,
  reduceTransparency,
  status,
  testID,
  title,
}: {
  body: string
  icon: WorkerV5IconName
  icons: WorkerV5SettingsIcons
  listAura: WorkerV5SettingsAura
  onPress: () => void
  reduceTransparency: boolean
  status: string
  testID: string
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
      {!reduceTransparency ? <ListAura testID={`${testID}-mint-aura`} /> : null}
      <View style={styles.workerSettingsActionIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={icons[icon]} style={styles.workerSettingsActionIcon} />
      </View>
      <View style={styles.workerSettingsActionCopy}>
        <Text style={styles.workerSettingsActionTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.workerSettingsActionBody} numberOfLines={2}>{body}</Text>
      </View>
      <View style={[styles.workerSettingsStatusPill, reduceTransparency && styles.opaqueCard]}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Text style={styles.workerSettingsStatusText} numberOfLines={1}>{status}</Text>
      </View>
    </Pressable>
  )
}

export function WorkerV5ReadOnlyToggleList({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ enabled: boolean; label: string; value: string }>
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
