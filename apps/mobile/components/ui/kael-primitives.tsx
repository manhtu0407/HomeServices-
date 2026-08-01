import { useId, type ReactNode, type Ref } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type AccessibilityRole,
  type AccessibilityState,
  type DimensionValue,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect } from 'react-native-svg'
import { aura, color, component, glass, radius, shadow, spacing, typography } from '@/design/theme'
import { useGlassAccessibility } from './accessibility-motion'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'
import { AlphaStop as Stop } from './svg-alpha-stop'

type KaelButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type KaelChipVariant = 'selected' | 'unselected' | 'successStatus' | 'warning' | 'error'
type KaelTextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2'
  | 'tabularBody'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'label'
  | 'caption'
type KaelTextTone = 'primary' | 'strong' | 'secondary' | 'muted' | 'inverse'
type KaelBadgeVariant = 'mint' | 'neutral' | 'warning' | 'error'

const webTextInputNoOutline = {
  outlineColor: 'transparent',
  outlineStyle: 'none',
  outlineWidth: 0,
} as unknown as TextStyle

type KaelTextInputProps = TextInputProps & { ref?: Ref<TextInput> }

export function KaelTextInput({ ref, style, ...inputProps }: KaelTextInputProps) {
  return <TextInput {...inputProps} ref={ref} style={[webTextInputNoOutline, style]} />
}

type KaelButtonProps = {
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
  accessibilityState?: AccessibilityState
  disabled?: boolean
  label: string
  leftAdornment?: ReactNode
  loading?: boolean
  onPress: () => void
  size?: 'default' | 'small'
  backgroundLayer?: ReactNode
  showPrimaryGradient?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  testID?: string
  variant?: KaelButtonVariant
}

export function KaelButton({
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  disabled = false,
  label,
  leftAdornment,
  loading = false,
  onPress,
  size = 'default',
  backgroundLayer,
  showPrimaryGradient = true,
  style,
  textStyle,
  testID,
  variant = 'primary',
}: KaelButtonProps) {
  const { reduceMotion } = useGlassAccessibility()
  const primaryGradientId = `kael-primary-button-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const isPrimary = variant === 'primary'
  const isDisabled = disabled || loading
  const minHeight = size === 'small' ? component.button.small.height : component.button.primary.height
  const buttonRadius = Math.min(component.button.primary.radius, minHeight / 2)

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
        busy: accessibilityState?.busy ?? loading,
        disabled: accessibilityState?.disabled ?? isDisabled,
      }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: buttonRadius, minHeight },
        buttonVariantStyle(variant, isDisabled, showPrimaryGradient),
        reduceMotionAwarePressStyle(pressed, reduceMotion),
        isDisabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      {backgroundLayer}
      {isPrimary && !isDisabled && showPrimaryGradient ? (
        <PrimaryButtonGradient gradientId={primaryGradientId} height={minHeight} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={isPrimary ? component.button.primary.text : buttonTextColor(variant, isDisabled)} />
      ) : (
        <View style={styles.buttonContent}>
          {leftAdornment ? <View pointerEvents="none" style={styles.buttonAdornment}>{leftAdornment}</View> : null}
          <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.buttonText, { color: buttonTextColor(variant, isDisabled) }, textStyle]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

type KaelChipProps = {
  accessibilityLabel?: string
  accessibilityState?: AccessibilityState
  backgroundLayer?: ReactNode
  disabled?: boolean
  label: string
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
  textStyle?: StyleProp<TextStyle>
  variant?: KaelChipVariant
}

export function KaelChip({ accessibilityLabel, accessibilityState, backgroundLayer, disabled = false, label, onPress, style, testID, textStyle, variant = 'unselected' }: KaelChipProps) {
  const chipToken = component.chip[variant]
  const content = (
    <Text style={[styles.chipText, { color: chipToken.text }, backgroundLayer ? styles.chipTextRaised : null, textStyle]} numberOfLines={1}>
      {label}
    </Text>
  )

  if (!onPress) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        style={[styles.chip, { backgroundColor: chipToken.bg, borderColor: chipToken.border }, style]}
        testID={testID}
      >
        {backgroundLayer}
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: chipToken.bg, borderColor: chipToken.border }, disabled ? styles.disabled : null, pressed ? styles.pressed : null, style]}
      testID={testID}
    >
      {backgroundLayer}
      {content}
    </Pressable>
  )
}

export function KaelSwitch({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  size = 'default',
  style,
  thumbStyle,
  testID,
  value,
}: {
  accessibilityLabel?: string
  disabled?: boolean
  onValueChange: (value: boolean) => void
  size?: 'default' | 'small'
  style?: StyleProp<ViewStyle>
  thumbStyle?: StyleProp<ViewStyle>
  testID?: string
  value: boolean
}) {
  const { reduceMotion } = useGlassAccessibility()
  const trackStyle = size === 'small' ? styles.switchTrackSmall : styles.switchTrack
  const baseThumbStyle = size === 'small' ? styles.switchThumbSmall : styles.switchThumb
  const thumbOnStyle = size === 'small' ? styles.switchThumbSmallOn : styles.switchThumbOn

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        trackStyle,
        value ? styles.switchTrackOn : styles.switchTrackOff,
        disabled ? styles.disabled : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
        style,
      ]}
      testID={testID}
    >
      <View style={[baseThumbStyle, value ? thumbOnStyle : styles.switchThumbOff, thumbStyle]} />
    </Pressable>
  )
}

export function KaelBadge({
  label,
  style,
  testID,
  textStyle,
  variant = 'mint',
}: {
  label: string
  style?: StyleProp<ViewStyle>
  testID?: string
  textStyle?: StyleProp<TextStyle>
  variant?: KaelBadgeVariant
}) {
  return (
    <View style={[styles.badge, badgeVariantStyle(variant), style]} testID={testID}>
      <Text numberOfLines={1} style={[styles.badgeText, badgeTextVariantStyle(variant), textStyle]}>
        {label}
      </Text>
    </View>
  )
}

export function KaelAlertBadge({
  count,
  max = 99,
  style,
  testID,
  textStyle,
}: {
  count: number
  max?: number
  style?: StyleProp<ViewStyle>
  testID?: string
  textStyle?: StyleProp<TextStyle>
}) {
  if (count <= 0) return null
  const label = count > max ? `${max}+` : String(count)

  return (
    <View style={[styles.alertBadge, style]} testID={testID}>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={[styles.alertBadgeText, textStyle]}>
        {label}
      </Text>
    </View>
  )
}

export function KaelProgressPill({
  accessibilityLabel,
  label,
  testID,
  value,
}: {
  accessibilityLabel?: string
  label?: string
  testID?: string
  value: number
}) {
  const normalized = clamp01(value)
  const percentLabel = label ?? `${Math.round(normalized * 100)}%`

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? percentLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(normalized * 100) }}
      style={styles.progressPill}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.progressPillFill, { width: `${normalized * 100}%` as DimensionValue }]} />
      <Text numberOfLines={1} style={styles.progressPillText}>
        {percentLabel}
      </Text>
    </View>
  )
}

export function KaelRatingCapsule({
  label,
  rating,
  testID,
}: {
  label?: string
  rating: number | null
  testID?: string
}) {
  const safeRating = typeof rating === 'number' && Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : null
  const starCount = safeRating === null ? 0 : Math.round(safeRating)
  const stars = '★★★★★'.slice(0, starCount).padEnd(5, '☆')
  const valueLabel = label ?? (safeRating === null ? 'Not yet' : `${safeRating.toFixed(1)}/5`)

  return (
    <View accessibilityLabel={valueLabel} style={styles.ratingCapsule} testID={testID}>
      <Text numberOfLines={1} style={styles.ratingStars}>{stars}</Text>
      <Text numberOfLines={1} style={styles.ratingText}>{valueLabel}</Text>
    </View>
  )
}

type KaelTextProps = TextProps & {
  children: ReactNode
  style?: StyleProp<TextStyle>
  tone?: KaelTextTone
  variant?: KaelTextVariant
}

export function KaelText({ children, style, tone = 'primary', variant = 'body', ...textProps }: KaelTextProps) {
  const scale = typography[variant]
  const fontVariant = 'fontVariant' in scale ? scale.fontVariant : undefined

  return (
    <Text
      style={[
        styles.kaelText,
        {
          color: color.text[tone],
          fontFamily: typography.fontFamily,
          fontSize: scale.fontSize,
          fontVariant,
          fontWeight: scale.fontWeight,
          lineHeight: scale.lineHeight,
        },
        style,
      ]}
      {...textProps}
    >
      {children}
    </Text>
  )
}

type KaelCardProps = {
  children: ReactNode
  large?: boolean
  raised?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function KaelCard({ children, large = false, raised = false, style, testID }: KaelCardProps) {
  return (
    <View style={[styles.card, large ? styles.cardLarge : null, raised ? styles.cardRaised : styles.cardSoft, style]} testID={testID}>
      {children}
    </View>
  )
}

type KaelTextFieldProps = TextInputProps & {
  inputShellAdornment?: ReactNode
  inputShellStyle?: StyleProp<ViewStyle>
  inputShellTestID?: string
  label?: string
  labelStyle?: StyleProp<TextStyle>
  mode?: 'text' | 'search'
  shellStyle?: StyleProp<ViewStyle>
}

export function KaelTextField({ inputShellAdornment, inputShellStyle, inputShellTestID, label, labelStyle, mode = 'text', shellStyle, style, ...inputProps }: KaelTextFieldProps) {
  return (
    <View style={[styles.fieldStack, shellStyle]}>
      {label ? <Text style={[styles.fieldLabel, labelStyle]}>{label}</Text> : null}
      <View style={[styles.inputShell, inputShellStyle]} testID={inputShellTestID}>
        {inputShellAdornment}
        {mode === 'search' ? <SearchIcon /> : null}
        <TextInput
          placeholderTextColor={component.input.placeholder}
          style={[styles.input, webTextInputNoOutline, mode === 'search' ? styles.searchInput : null, style]}
          {...inputProps}
        />
      </View>
    </View>
  )
}

type KaelSegmentedControlProps<T extends string> = {
  activeSegmentStyle?: StyleProp<ViewStyle>
  activeTextStyle?: StyleProp<TextStyle>
  disabled?: boolean
  inactiveSegmentStyle?: StyleProp<ViewStyle>
  inactiveTextStyle?: StyleProp<TextStyle>
  onChange: (value: T) => void
  options: readonly { accessibilityLabel?: string; icon?: ReactNode; label: string; testID?: string; value: T }[]
  segmentStyle?: StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
  testID?: string
  textStyle?: StyleProp<TextStyle>
  value?: null | T
}

export function KaelSegmentedControl<T extends string>({
  activeSegmentStyle,
  activeTextStyle,
  disabled = false,
  inactiveSegmentStyle,
  inactiveTextStyle,
  onChange,
  options,
  segmentStyle,
  style,
  testID,
  textStyle,
  value,
}: KaelSegmentedControlProps<T>) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <View style={[styles.segmentedShell, style]} testID={testID}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: active }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              active ? styles.segmentActive : null,
              segmentStyle,
              active ? activeSegmentStyle : inactiveSegmentStyle,
              reduceMotionAwarePressStyle(pressed, reduceMotion),
              disabled ? styles.disabled : null,
            ]}
            testID={option.testID}
          >
            {option.icon}
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null, textStyle, active ? activeTextStyle : inactiveTextStyle]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

type KaelInlineStepperProps = {
  buttonStyle?: StyleProp<ViewStyle>
  controlTextStyle?: StyleProp<TextStyle>
  decrementButtonTestID?: string
  decrementDisabled?: boolean
  decrementLabel?: string
  incrementButtonTestID?: string
  incrementDisabled?: boolean
  incrementLabel?: string
  onDecrement: () => void
  onIncrement: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
  value: number | string
  valueAccessibilityLabel?: string
  valueStyle?: StyleProp<TextStyle>
  valueTestID?: string
}

export function KaelInlineStepper({
  buttonStyle,
  controlTextStyle,
  decrementButtonTestID,
  decrementDisabled = false,
  decrementLabel = 'Giảm',
  incrementLabel = 'Tăng',
  incrementButtonTestID,
  incrementDisabled = false,
  onDecrement,
  onIncrement,
  style,
  testID,
  value,
  valueAccessibilityLabel,
  valueStyle,
  valueTestID,
}: KaelInlineStepperProps) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <View style={[styles.stepperShell, style]} testID={testID}>
      <Pressable
        accessibilityLabel={decrementLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: decrementDisabled }}
        disabled={decrementDisabled}
        onPress={onDecrement}
        style={({ pressed }) => [
          styles.stepperButton,
          buttonStyle,
          reduceMotionAwarePressStyle(pressed, reduceMotion),
          decrementDisabled ? styles.disabled : null,
        ]}
        testID={decrementButtonTestID}
      >
        <Text style={[styles.stepperButtonText, controlTextStyle]}>-</Text>
      </Pressable>
      <Text accessibilityLabel={valueAccessibilityLabel} style={[styles.stepperValue, valueStyle]} testID={valueTestID}>
        {value}
      </Text>
      <Pressable
        accessibilityLabel={incrementLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: incrementDisabled }}
        disabled={incrementDisabled}
        onPress={onIncrement}
        style={({ pressed }) => [
          styles.stepperButton,
          buttonStyle,
          reduceMotionAwarePressStyle(pressed, reduceMotion),
          incrementDisabled ? styles.disabled : null,
        ]}
        testID={incrementButtonTestID}
      >
        <Text style={[styles.stepperButtonText, controlTextStyle]}>+</Text>
      </Pressable>
    </View>
  )
}

export function MintAura({ intensity = 'component', style, testID }: { intensity?: 'page' | 'component' | 'iconTile'; style?: StyleProp<ViewStyle>; testID?: string }) {
  const token = aura[intensity]
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} testID={testID}>
      <Svg height="100%" width="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`mint-aura-${intensity}`} cx={`${token.center.x * 100}%`} cy={`${token.center.y * 100}%`} r="82%">
            {token.stops.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#mint-aura-${intensity})`} />
      </Svg>
    </View>
  )
}

function PrimaryButtonGradient({ gradientId, height }: { gradientId: string; height: number }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          {component.button.primary.gradient.map((stopColor, index) => (
            <Stop key={stopColor} offset={component.button.primary.gradientStops[index]} stopColor={stopColor} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height={height} fill={`url(#${gradientId})`} />
    </Svg>
  )
}

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M10.8 18.2a7.4 7.4 0 1 1 0-14.8 7.4 7.4 0 0 1 0 14.8Zm5.4-1.2 4.4 4.4" stroke={color.text.muted} strokeLinecap="round" strokeWidth={2.2} />
    </Svg>
  )
}

function buttonVariantStyle(variant: KaelButtonVariant, disabled: boolean, showPrimaryGradient = true): ViewStyle {
  if (disabled) {
    return {
      backgroundColor: component.button.disabled.bg,
      borderColor: component.button.disabled.border,
    }
  }
  if (variant === 'primary') {
    return {
      backgroundColor: showPrimaryGradient ? 'transparent' : component.button.primary.gradient[1],
      borderColor: component.button.primary.border,
      ...shadow.primary,
    } as ViewStyle
  }
  if (variant === 'secondary') {
    return {
      backgroundColor: component.button.secondary.bg,
      borderColor: component.button.secondary.border,
    }
  }
  if (variant === 'destructive') {
    return {
      backgroundColor: component.button.destructive.bg,
      borderColor: component.button.destructive.border,
    }
  }
  return {
    backgroundColor: component.button.ghost.bg,
    borderColor: component.button.ghost.border,
  }
}

function buttonTextColor(variant: KaelButtonVariant, disabled: boolean) {
  if (disabled) return component.button.disabled.text
  if (variant === 'primary') return component.button.primary.text
  if (variant === 'destructive') return component.button.destructive.text
  if (variant === 'secondary') return component.button.secondary.text
  return component.button.ghost.text
}

function badgeVariantStyle(variant: KaelBadgeVariant): ViewStyle {
  if (variant === 'error') return { backgroundColor: '#FFF1F1', borderColor: '#FFD4D1' }
  if (variant === 'warning') return { backgroundColor: '#FFF8E5', borderColor: '#FFE1A3' }
  if (variant === 'neutral') return { backgroundColor: color.surface.soft, borderColor: color.surface.stroke }
  return { backgroundColor: color.mint.mint50, borderColor: color.surface.strokeStrong }
}

function badgeTextVariantStyle(variant: KaelBadgeVariant): TextStyle {
  if (variant === 'error') return { color: color.accent.destructive }
  if (variant === 'warning') return { color: '#9A6A00' }
  if (variant === 'neutral') return { color: color.text.secondary }
  return { color: color.brand.primaryDark }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

const sharedButtonText: TextStyle = {
  fontFamily: typography.fontFamily,
  fontSize: typography.label.fontSize,
  fontWeight: typography.label.fontWeight,
  letterSpacing: 0,
  lineHeight: typography.label.lineHeight,
}

const styles = StyleSheet.create({
  alertBadge: {
    alignItems: 'center',
    backgroundColor: color.accent.destructive,
    borderColor: color.surface.base,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 20,
    minWidth: 20,
    paddingHorizontal: 6,
  },
  alertBadgeText: {
    color: color.text.inverse,
    fontFamily: typography.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    textAlign: 'center',
  },
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: spacing.md,
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  button: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: component.button.primary.radius,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: component.button.primary.paddingX,
    position: 'relative',
  },
  buttonText: sharedButtonText,
  buttonAdornment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 2,
  },
  card: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: component.card.radius,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.cardPadding,
  },
  cardLarge: {
    borderRadius: component.card.largeRadius,
    padding: spacing.cardPaddingLarge,
  },
  cardRaised: {
    ...shadow.raised,
  },
  cardSoft: {
    ...shadow.soft,
  },
  chip: {
    alignItems: 'center',
    borderRadius: component.chip.radius,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: component.chip.height,
    overflow: 'hidden',
    paddingHorizontal: component.chip.paddingX,
    position: 'relative',
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  chipTextRaised: {
    position: 'relative',
    zIndex: 1,
  },
  disabled: {
    opacity: component.button.disabled.opacity,
  },
  fieldLabel: {
    color: color.text.secondary,
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  fieldStack: {
    gap: spacing.xs,
  },
  input: {
    color: color.text.primary,
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    minHeight: component.input.height - 2,
    padding: 0,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: component.input.bg,
    borderColor: component.input.border,
    borderCurve: 'continuous',
    borderRadius: component.input.radius,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: component.input.height,
    paddingHorizontal: component.input.paddingX,
  },
  kaelText: {
    letterSpacing: 0,
  },
  mediaTray: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
  },
  mediaTrayText: {
    color: color.text.secondary,
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
  },
  micCircle: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pressed: {
    opacity: 0.78,
  },
  progressPill: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    minWidth: 92,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    position: 'relative',
  },
  progressPillFill: {
    backgroundColor: color.mint.mint300,
    borderRadius: radius.pill,
    bottom: 3,
    left: 3,
    opacity: 0.74,
    position: 'absolute',
    top: 3,
  },
  progressPillText: {
    color: color.brand.primaryDark,
    fontFamily: typography.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    position: 'relative',
    zIndex: 1,
  },
  ratingCapsule: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  ratingStars: {
    color: color.accent.gold,
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  ratingText: {
    color: color.text.secondary,
    fontFamily: typography.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  searchInput: {
    minHeight: component.input.height - 2,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.sm,
  },
  segmentActive: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderWidth: 1,
    ...shadow.soft,
  },
  segmentedShell: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segmentText: {
    color: color.text.secondary,
    fontFamily: typography.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: color.brand.primaryDark,
  },
  stepperButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  stepperButtonText: {
    color: color.brand.primary,
    fontFamily: typography.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
  },
  stepperShell: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    width: 148,
  },
  stepperValue: {
    color: color.text.strong,
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
  },
  uploadIcon: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  switchThumb: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    width: 36,
    ...shadow.soft,
  },
  switchThumbOff: {
    transform: [{ translateX: 0 }],
  },
  switchThumbOn: {
    transform: [{ translateX: 42 }],
  },
  switchThumbSmall: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 24,
    width: 24,
    ...shadow.soft,
  },
  switchThumbSmallOn: {
    transform: [{ translateX: 24 }],
  },
  switchTrack: {
    backgroundColor: color.surface.disabled,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 84,
  },
  switchTrackOff: {
    backgroundColor: color.surface.disabled,
    borderColor: color.surface.stroke,
  },
  switchTrackOn: {
    backgroundColor: color.brand.primary,
    borderColor: color.mint.mint300,
  },
  switchTrackSmall: {
    backgroundColor: color.surface.disabled,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 54,
  },
  voiceBar: {
    backgroundColor: color.mint.mint300,
    borderRadius: radius.pill,
    width: 3,
  },
  voiceBars: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  voiceCapsule: {
    alignItems: 'center',
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  voiceText: {
    color: color.text.muted,
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
  },
})
