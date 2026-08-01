import type { ReactNode } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ProfilePreferenceStyles as styles } from './profile-preference-styles'
import { ProfileFormulaMintSurface } from './profile-utility-surfaces'

export function ProfilePreferencePanel({
  body,
  children,
  framelessCenteredImage = false,
  image,
  scope,
  testID,
  title,
  tokens,
}: {
  body: string
  children: ReactNode
  framelessCenteredImage?: boolean
  image?: ImageSourcePropType
  scope: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <ProfileFormulaMintSurface
      contentStyle={styles.panelContent}
      scope={scope}
      style={[styles.panel, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={testID}
    >
      <View
        style={[styles.panelHeader, framelessCenteredImage ? styles.panelHeaderCentered : null]}
        testID={`${testID}-header`}
      >
        {image ? (
          <View
            style={[
              styles.panelHeaderIconFrame,
              { backgroundColor: framelessCenteredImage ? 'transparent' : tokens.ghost },
            ]}
            testID={`${testID}-header-icon`}
          >
            <Image
              accessibilityIgnoresInvertColors
              contentFit="contain"
              source={image}
              style={styles.panelHeaderIcon}
            />
          </View>
        ) : null}
        <View style={styles.panelHeaderCopy}>
          <Text style={[styles.panelHeaderTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.panelHeaderBody, { color: tokens.muted }]}>{body}</Text>
        </View>
      </View>
      <View style={[styles.panelBody, { borderTopColor: tokens.border }]}>
        {children}
      </View>
    </ProfileFormulaMintSurface>
  )
}

export function ProfilePreferenceOption({
  body,
  onPress,
  selected,
  selectedLabel,
  testID,
  title,
  tokens,
  visual,
}: {
  body: string
  onPress: () => void
  selected: boolean
  selectedLabel?: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
  visual: ReactNode
}) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityHint={body}
      accessibilityLabel={title}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? tokens.ghost : tokens.base,
          borderColor: selected ? tokens.primary : tokens.border,
        },
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <View
        style={[styles.optionVisualFrame, { backgroundColor: tokens.ghost }]}
        testID={`${testID}-visual`}
      >
        {typeof visual === 'string' ? <Text style={styles.optionVisual}>{visual}</Text> : visual}
      </View>
      <View style={styles.optionCopy}>
        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionTitle, { color: tokens.text }]}>{title}</Text>
          {selected && selectedLabel ? (
            <View style={[styles.selectedPill, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}>
              <Text style={[styles.selectedLabel, { color: tokens.primary }]}>{selectedLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.optionBody, { color: tokens.muted }]}>{body}</Text>
      </View>
    </Pressable>
  )
}
