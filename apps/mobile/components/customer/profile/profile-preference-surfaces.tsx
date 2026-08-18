import type { ReactNode } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'

import type { CustomerThemeTokens } from '../customer-theme'
import { ProfileSettingsGlyph, type ProfileSettingsGlyphName } from './profile-settings-icons'
import { customerV21ProfilePreferenceStyles as styles } from './profile-preference-styles'
import { ProfileFormulaMintSurface } from './profile-utility-surfaces'
import { V21Card } from '../ui/shared-surfaces'

export function ProfilePreferencePanel({
  body,
  children,
  framelessCenteredImage = false,
  hideHeader = false,
  image,
  icon,
  simple = false,
  scope,
  testID,
  title,
  tokens,
}: {
  body: string
  children: ReactNode
  framelessCenteredImage?: boolean
  hideHeader?: boolean
  image?: ImageSourcePropType
  icon?: ProfileSettingsGlyphName
  simple?: boolean
  scope: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  if (simple) {
    return (
      <V21Card
        style={[styles.simplePanel, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID={testID}
      >
        {hideHeader ? null : (
          <View style={styles.simplePanelHeader} testID={`${testID}-header`}>
            <View
              style={[styles.simplePanelHeaderIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
              testID={`${testID}-header-icon`}
            >
              {icon ? <ProfileSettingsGlyph color={tokens.primary} name={icon} testID={`${testID}-header-icon-glyph`} /> : null}
            </View>
            <View style={styles.simplePanelHeaderCopy}>
              <Text style={[styles.simplePanelHeaderTitle, { color: tokens.text }]}>{title}</Text>
              <Text style={[styles.simplePanelHeaderBody, { color: tokens.muted }]}>{body}</Text>
            </View>
          </View>
        )}
        <View style={styles.simplePanelBody}>
          {children}
        </View>
      </V21Card>
    )
  }

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
