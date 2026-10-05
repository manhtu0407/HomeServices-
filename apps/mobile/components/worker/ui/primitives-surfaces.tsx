import {
  Pressable,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'

import { PrimaryCtaFill } from '@/components/ui/primary-cta-fill'

import { styles as lightStyles } from './primitives-styles'
import { useWorkerThemedStyles } from './worker-dark-styles'

export { WorkerV5InfoRow } from '../jobs/shared-surfaces'

function Text({ style, ...props }: TextProps) {
  const styles = useWorkerThemedStyles(lightStyles)
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SectionHeader({ action, styleVariant = 'default', title }: { action?: string; styleVariant?: 'default' | 'jobs-review'; title: string }) {
  const styles = useWorkerThemedStyles(lightStyles)
  return (
    <View style={[styles.sectionHeader, styleVariant === 'jobs-review' && styles.sectionHeaderJobsReview]} testID="worker-v5-section-header">
      <Text style={[styles.sectionHeaderTitle, styleVariant === 'jobs-review' && styles.sectionHeaderTitleJobsReview]}>{title}</Text>
      {action ? <Text style={[styles.sectionHeaderAction, styleVariant === 'jobs-review' && styles.sectionHeaderActionJobsReview]}>{action}</Text> : null}
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
  const styles = useWorkerThemedStyles(lightStyles)
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
      {primary && !disabled ? <PrimaryCtaFill radius={0} /> : null}
      <Text style={[styles.navButtonText, primary && styles.navButtonPrimaryText, disabled && styles.navButtonDisabledText]}>{label}</Text>
    </Pressable>
  )
}

export function WorkerV5PrimaryButtonFill({
  disabled,
  testID = 'worker-v5-primary-gradient',
  variant = 'default',
}: {
  disabled: boolean
  testID?: string
  variant?: 'default' | 'source'
}) {
  if (disabled) return null
  return <PrimaryCtaFill radius={variant === 'source' ? 0 : 26} testID={testID} />
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
  const styles = useWorkerThemedStyles(lightStyles)
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
      <Text style={[styles.primaryActionText, disabled && (usesSourceTone ? styles.sourceActionDisabledText : styles.navButtonDisabledText)]}>{label}</Text>
    </Pressable>
  )
}
