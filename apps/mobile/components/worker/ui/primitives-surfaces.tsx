import { Image } from 'expo-image'
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect } from 'react-native-svg'

import { MintAura } from '@/components/ui/kael-primitives'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { color, component } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from './format'
import { styles } from './primitives-styles'

export { WorkerV5InfoRow } from '../jobs/shared-surfaces'

type WorkerV5BankProfile = {
  bank_account_masked?: string | null
  bank_name?: string | null
} | null | undefined

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SectionHeader({ action, title }: { action?: string; title: string }) {
  return (
    <View style={styles.sectionHeader} testID="worker-v5-section-header">
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {action ? <Text style={styles.sectionHeaderAction}>{action}</Text> : null}
    </View>
  )
}

export function WorkerV5BackArrowIcon() {
  return (
    <Svg height={18} style={styles.iconButtonIcon} viewBox="0 0 24 24" width={18}>
      <Path
        d="M15 18L9 12l6-6"
        fill="none"
        stroke={color.brand.primaryDark}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  )
}

export function WorkerV5BankCard({
  bankLogo,
  language,
  profile,
  reduceTransparency,
  walletIcon,
}: {
  bankLogo?: ImageSourcePropType | null
  language: AppLanguage
  profile: WorkerV5BankProfile
  reduceTransparency: boolean
  walletIcon: ImageSourcePropType
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  return (
    <View style={[styles.bankCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-bank-card">
      <View style={styles.bankIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          contentFit="contain"
          source={bankLogo ?? walletIcon}
          style={bankLogo ? styles.bankCardLogoImage : styles.utilityIcon}
          testID="worker-v5-bank-card-logo"
        />
      </View>
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-bank-card-title">
          {hasBank ? profile?.bank_name || textByLanguage(language, 'Ngân hàng', 'Bank') : textByLanguage(language, 'Chưa xác minh ngân hàng', 'No verified bank')}
        </Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-bank-card-meta">
          {hasBank ? profile?.bank_account_masked : textByLanguage(language, 'Dùng luồng xác minh hiện hữu', 'Use the existing verification flow')}
        </Text>
      </View>
    </View>
  )
}

export function WorkerV5NavButton({
  disabled,
  label,
  onPress,
  primary,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        primary ? styles.navButtonPrimary : styles.navButtonSecondary,
        disabled && styles.navButtonDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID={primary ? 'worker-v5-next' : 'worker-v5-previous'}
    >
      <Text style={[styles.navButtonText, primary && styles.navButtonPrimaryText, disabled && styles.navButtonDisabledText]}>{label}</Text>
    </Pressable>
  )
}

export function WorkerV5PrimaryButtonFill({
  disabled,
  variant = 'default',
}: {
  disabled: boolean
  variant?: 'default' | 'source'
}) {
  if (disabled) return null
  const gradient = variant === 'source'
    ? ['#31D7C2', '#09B29E', '#077C72'] as const
    : component.button.primary.gradient
  const gradientStops = variant === 'source'
    ? [0, 0.48, 1] as const
    : component.button.primary.gradientStops
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 56" preserveAspectRatio="none" testID="worker-v5-primary-gradient">
      <Defs>
        <LinearGradient
          id={`worker-v5-primary-gradient-fill-${variant}`}
          x1="0"
          x2="1"
          y1="0"
          y2={variant === 'source' ? '0' : '1'}
        >
          {gradient.map((stopColor, index) => (
            <Stop key={stopColor} offset={gradientStops[index]} stopColor={stopColor} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="56" rx={variant === 'source' ? '0' : '26'} fill={`url(#worker-v5-primary-gradient-fill-${variant})`} />
    </Svg>
  )
}

export function WorkerV5PrimaryActionButton({
  disabled,
  label,
  onPress,
  variant = 'default',
}: {
  disabled: boolean
  label: string
  onPress: () => void
  variant?: 'default' | 'source'
}) {
  const usesSourceTone = variant === 'source'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryActionButton,
        usesSourceTone && styles.primaryActionButtonSource,
        disabled && (usesSourceTone ? styles.sourceActionDisabled : styles.navButtonDisabled),
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID="worker-v5-primary-action"
    >
      <WorkerV5PrimaryButtonFill disabled={disabled} variant={variant} />
      {!disabled && !usesSourceTone ? <View pointerEvents="none" style={styles.primaryActionTopHighlight} /> : null}
      <Text style={[styles.primaryActionText, disabled && (usesSourceTone ? styles.sourceActionDisabledText : styles.navButtonDisabledText)]}>{label}</Text>
    </Pressable>
  )
}
