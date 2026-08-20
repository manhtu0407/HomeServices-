import type { ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import { styles } from './advisory-styles'

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5PrimaryButtonFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ChatBubble({
  align,
  body,
  label,
}: {
  align?: 'right'
  body: string
  label: string
}) {
  return (
    <View style={[styles.chatBubble, align === 'right' ? styles.chatBubbleRight : null]}>
      <Text style={styles.chatBubbleBody} numberOfLines={4}>{body}</Text>
      <Text style={styles.chatBubbleLabel} numberOfLines={1}>{label}</Text>
    </View>
  )
}

export function WorkerV5ActionRail({
  auraTestID,
  caseWideAura: CaseWideAura,
  formulaAura = false,
  onPrimary,
  onSecondary,
  primary,
  primaryButtonFill: PrimaryButtonFill,
  primaryDisabled = false,
  primaryTestID,
  primaryVariant = 'default',
  reduceTransparency,
  secondary,
  secondaryTestID,
  styleVariant = 'default',
  zipAura: ZipAura,
}: {
  auraTestID?: string
  caseWideAura: WorkerV5CaseAuraComponent
  formulaAura?: boolean
  onPrimary?: () => void
  onSecondary?: () => void
  primary: string
  primaryButtonFill: WorkerV5PrimaryButtonFillComponent
  primaryDisabled?: boolean
  primaryTestID?: string
  primaryVariant?: 'default' | 'source'
  reduceTransparency: boolean
  secondary: string
  secondaryTestID?: string
  styleVariant?: 'default' | 'jobs-review'
  zipAura: WorkerV5CaseAuraComponent
}) {
  const primaryIsDisabled = primaryDisabled || !onPrimary
  const primaryUsesSourceTone = primaryVariant === 'source'
  const isJobsReview = styleVariant === 'jobs-review'
  return (
    <View
      accessibilityRole="summary"
      style={[styles.navigationRow, isJobsReview ? styles.navigationRowJobsReview : null]}
      testID="worker-v5-action-rail"
    >
      {formulaAura && !reduceTransparency && !isJobsReview ? (
        <>
          <CaseWideAura scope={`${auraTestID ?? 'ActionRail'}Wide`} style={styles.actionRailFormulaAura} testID={auraTestID} />
          <ZipAura scope={`${auraTestID ?? 'ActionRail'}Fine`} style={styles.actionRailZipAura} testID={auraTestID ? `${auraTestID}-zip` : undefined} />
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !onSecondary }}
        disabled={!onSecondary}
        onPress={onSecondary}
        style={({ pressed }) => [
          styles.navButton,
          styles.navButtonSecondary,
          isJobsReview ? styles.navButtonJobsReview : null,
          isJobsReview ? styles.navButtonSecondaryJobsReview : null,
          reduceTransparency && styles.opaqueCard,
          pressed && onSecondary ? styles.pressed : null,
        ]}
        testID={secondaryTestID}
      >
        <Text adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.navButtonText, isJobsReview ? styles.navButtonTextJobsReview : null, styles.actionRailButtonText]} numberOfLines={1}>{secondary}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryIsDisabled }}
        disabled={primaryIsDisabled}
        onPress={onPrimary}
        style={({ pressed }) => [
          styles.navButton,
          styles.navButtonPrimary,
          primaryUsesSourceTone && !isJobsReview ? styles.primaryActionButtonSource : null,
          isJobsReview ? styles.navButtonJobsReview : null,
          isJobsReview ? styles.navButtonPrimaryJobsReview : null,
          reduceTransparency && (primaryUsesSourceTone ? styles.primaryActionButtonSource : styles.opaqueCard),
          primaryIsDisabled && (primaryUsesSourceTone ? styles.sourceActionDisabled : styles.navButtonDisabled),
          pressed && !primaryIsDisabled ? styles.pressed : null,
        ]}
        testID={primaryTestID}
      >
        {primaryUsesSourceTone && !isJobsReview ? <PrimaryButtonFill disabled={primaryIsDisabled} variant="source" /> : null}
        <Text
          style={[
            styles.navButtonText,
            isJobsReview ? styles.navButtonTextJobsReview : null,
            styles.actionRailButtonText,
            styles.navButtonPrimaryText,
            reduceTransparency && !primaryUsesSourceTone && styles.actionRailPrimaryText,
            primaryIsDisabled && (primaryUsesSourceTone ? styles.sourceActionDisabledText : styles.navButtonDisabledText),
          ]}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
        >
          {primary}
        </Text>
      </Pressable>
    </View>
  )
}

export function WorkerV5SingleSourceActionButton({
  disabled,
  label,
  onPress,
  primaryButtonFill: PrimaryButtonFill,
  reduceTransparency,
  styleVariant = 'default',
  testID,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  primaryButtonFill: WorkerV5PrimaryButtonFillComponent
  reduceTransparency: boolean
  styleVariant?: 'default' | 'jobs-review'
  testID: string
}) {
  const isJobsReview = styleVariant === 'jobs-review'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryActionButton,
        styles.primaryActionButtonSource,
        isJobsReview ? styles.primaryActionButtonJobsReview : null,
        reduceTransparency && styles.primaryActionButtonSource,
        disabled && styles.sourceActionDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID={testID}
    >
      {!isJobsReview ? <PrimaryButtonFill disabled={disabled} variant="source" /> : null}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.76}
        numberOfLines={1}
        style={[styles.primaryActionText, styles.navButtonPrimaryText, disabled && styles.sourceActionDisabledText]}
      >
        {label}
      </Text>
    </Pressable>
  )
}
