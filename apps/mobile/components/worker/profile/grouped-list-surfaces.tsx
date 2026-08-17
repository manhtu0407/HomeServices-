import { Image } from 'expo-image'
import type { ComponentType, ReactNode } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { useWorkerThemeMode } from '../worker-theme'
import { styles } from './grouped-list-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

type WorkerV5ProfileGroupAura = ComponentType<{
  reduceTransparency?: boolean
  scope: string
  testID?: string
}>

export function WorkerV5ProfileGroup({
  aura: Aura,
  auraScope,
  auraTestID,
  children,
  reduceTransparency,
  testID,
  title,
}: {
  aura?: WorkerV5ProfileGroupAura
  auraScope?: string
  auraTestID?: string
  children: ReactNode
  reduceTransparency?: boolean
  testID: string
  title: string
}) {
  const isDark = useWorkerThemeMode() === 'dark'

  return (
    <View style={styles.group} testID={testID}>
      <Text style={[styles.groupTitle, isDark ? styles.groupTitleDark : null]}>{title}</Text>
      <View style={[styles.groupCard, isDark ? styles.groupCardDark : null]}>
        {Aura && auraScope ? <Aura reduceTransparency={reduceTransparency} scope={auraScope} testID={auraTestID} /> : null}
        {children}
      </View>
    </View>
  )
}

export function WorkerV5ProfileGroupDivider() {
  const isDark = useWorkerThemeMode() === 'dark'
  return <View style={[styles.groupDivider, isDark ? styles.groupDividerDark : null]} />
}

export function WorkerV5ProfileGroupRow({
  accessibilityHint,
  description,
  icon,
  onPress,
  status,
  statusTone = 'muted',
  testID,
  title,
}: {
  accessibilityHint?: string
  description?: string
  icon: ImageSourcePropType
  onPress: () => void
  status?: string
  statusTone?: 'active' | 'danger' | 'muted'
  testID: string
  title: string
}) {
  const isDark = useWorkerThemeMode() === 'dark'
  const statusStyle = statusTone === 'active'
    ? styles.groupRowMetaActive
    : statusTone === 'danger'
      ? styles.groupRowMetaDanger
      : null

  return (
    <Pressable
      accessibilityHint={accessibilityHint ?? description}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.groupRow, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Image accessibilityIgnoresInvertColors contentFit="contain" source={icon} style={styles.groupRowIcon} testID={`${testID}-icon`} />
      <View style={styles.groupRowCopy}>
        <Text numberOfLines={2} style={[styles.groupRowTitle, isDark ? styles.groupRowTitleDark : null]} testID={`${testID}-title`}>{title}</Text>
        {description ? <Text numberOfLines={2} style={[styles.groupRowDescription, isDark ? styles.groupRowDescriptionDark : null]}>{description}</Text> : null}
      </View>
      {status ? <Text numberOfLines={2} style={[styles.groupRowMeta, statusStyle, isDark ? styles.groupRowMetaDark : null, isDark && statusTone === 'active' ? styles.groupRowMetaActiveDark : null]} testID={`${testID}-status`}>{status}</Text> : null}
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.groupRowChevron, isDark ? styles.groupRowChevronDark : null]}>›</Text>
    </Pressable>
  )
}
