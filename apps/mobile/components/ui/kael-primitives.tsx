import { type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type AccessibilityRole,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { aura, color, component, glass, radius, shadow, spacing, typography } from '@/design/theme'
import { useGlassAccessibility } from './accessibility-motion'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'

export type KaelButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type KaelChipVariant = 'selected' | 'unselected' | 'successStatus' | 'warning' | 'error'

type KaelButtonProps = {
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
  disabled?: boolean
  label: string
  loading?: boolean
  onPress: () => void
  size?: 'default' | 'small'
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: KaelButtonVariant
}

export function KaelButton({
  accessibilityLabel,
  accessibilityRole = 'button',
  disabled = false,
  label,
  loading = false,
  onPress,
  size = 'default',
  style,
  testID,
  variant = 'primary',
}: KaelButtonProps) {
  const { reduceMotion } = useGlassAccessibility()
  const isPrimary = variant === 'primary'
  const isDisabled = disabled || loading
  const minHeight = size === 'small' ? component.button.small.height : component.button.primary.height

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { minHeight },
        buttonVariantStyle(variant, isDisabled),
        reduceMotionAwarePressStyle(pressed, reduceMotion),
        isDisabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      {isPrimary && !isDisabled ? <PrimaryButtonGradient /> : null}
      {loading ? (
        <ActivityIndicator color={isPrimary ? component.button.primary.text : buttonTextColor(variant, isDisabled)} />
      ) : (
        <Text style={[styles.buttonText, { color: buttonTextColor(variant, isDisabled) }]}>{label}</Text>
      )}
    </Pressable>
  )
}

type KaelChipProps = {
  label: string
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: KaelChipVariant
}

export function KaelChip({ label, onPress, style, testID, variant = 'unselected' }: KaelChipProps) {
  const chipToken = component.chip[variant]
  const content = (
    <Text style={[styles.chipText, { color: chipToken.text }]} numberOfLines={1}>
      {label}
    </Text>
  )

  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: chipToken.bg, borderColor: chipToken.border }, style]} testID={testID}>
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: chipToken.bg, borderColor: chipToken.border }, pressed ? styles.pressed : null, style]}
      testID={testID}
    >
      {content}
    </Pressable>
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
  label?: string
  mode?: 'text' | 'search'
  shellStyle?: StyleProp<ViewStyle>
}

export function KaelTextField({ label, mode = 'text', shellStyle, style, ...inputProps }: KaelTextFieldProps) {
  return (
    <View style={[styles.fieldStack, shellStyle]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.inputShell}>
        {mode === 'search' ? <SearchIcon /> : null}
        <TextInput
          placeholderTextColor={component.input.placeholder}
          style={[styles.input, mode === 'search' ? styles.searchInput : null, style]}
          {...inputProps}
        />
      </View>
    </View>
  )
}

type KaelSegmentedControlProps<T extends string> = {
  onChange: (value: T) => void
  options: ReadonlyArray<{ icon?: ReactNode; label: string; value: T }>
  testID?: string
  value: T
}

export function KaelSegmentedControl<T extends string>({ onChange, options, testID, value }: KaelSegmentedControlProps<T>) {
  return (
    <View style={styles.segmentedShell} testID={testID}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            {option.icon}
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

type KaelInlineStepperProps = {
  decrementLabel?: string
  incrementLabel?: string
  onDecrement: () => void
  onIncrement: () => void
  testID?: string
  value: number | string
}

export function KaelInlineStepper({
  decrementLabel = 'Giảm',
  incrementLabel = 'Tăng',
  onDecrement,
  onIncrement,
  testID,
  value,
}: KaelInlineStepperProps) {
  return (
    <View style={styles.stepperShell} testID={testID}>
      <Pressable accessibilityLabel={decrementLabel} accessibilityRole="button" onPress={onDecrement} style={styles.stepperButton}>
        <Text style={styles.stepperButtonText}>-</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable accessibilityLabel={incrementLabel} accessibilityRole="button" onPress={onIncrement} style={styles.stepperButton}>
        <Text style={styles.stepperButtonText}>+</Text>
      </Pressable>
    </View>
  )
}

export function KaelVoiceInputCapsule({ label = 'Nhấn để nói...', testID }: { label?: string; testID?: string }) {
  return (
    <View style={styles.voiceCapsule} testID={testID}>
      <Text style={styles.voiceText}>{label}</Text>
      <View style={styles.voiceBars} pointerEvents="none">
        {[10, 18, 26, 16].map((height, index) => (
          <View key={index} style={[styles.voiceBar, { height }]} />
        ))}
      </View>
      <View style={styles.micCircle}>
        <Text style={styles.micText}>mic</Text>
      </View>
    </View>
  )
}

export function KaelMediaUploadTray({ label = 'Kéo & thả file vào đây hoặc nhấn để chọn file', testID }: { label?: string; testID?: string }) {
  return (
    <View style={styles.mediaTray} testID={testID}>
      <View style={styles.uploadIcon}>
        <PathIcon />
      </View>
      <Text style={styles.mediaTrayText}>{label}</Text>
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

function PrimaryButtonGradient() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 48" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="kael-primary-button" x1="0" y1="0" x2="1" y2="1">
          {component.button.primary.gradient.map((stopColor, index) => (
            <Stop key={stopColor} offset={component.button.primary.gradientStops[index]} stopColor={stopColor} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="48" rx="22" fill="url(#kael-primary-button)" />
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

function PathIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M12 16V5m0 0 4 4m-4-4-4 4M5 16v2.5A2.5 2.5 0 0 0 7.5 21h9A2.5 2.5 0 0 0 19 18.5V16" stroke={color.brand.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  )
}

function buttonVariantStyle(variant: KaelButtonVariant, disabled: boolean): ViewStyle {
  if (disabled) {
    return {
      backgroundColor: component.button.disabled.bg,
      borderColor: component.button.disabled.border,
    }
  }
  if (variant === 'primary') {
    return {
      backgroundColor: component.button.primary.gradient[1],
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

const sharedButtonText: TextStyle = {
  fontSize: typography.label.fontSize,
  fontWeight: '800',
  letterSpacing: 0,
  lineHeight: typography.label.lineHeight,
}

const styles = StyleSheet.create({
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
    paddingHorizontal: component.chip.paddingX,
  },
  chipText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  disabled: {
    opacity: component.button.disabled.opacity,
  },
  fieldLabel: {
    color: color.text.secondary,
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  fieldStack: {
    gap: spacing.xs,
  },
  input: {
    color: color.text.primary,
    flex: 1,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
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
    fontSize: typography.label.fontSize,
    fontWeight: '700',
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
  micText: {
    color: color.brand.primaryDark,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
  },
  pressed: {
    opacity: 0.78,
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
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
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
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
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
    fontSize: typography.label.fontSize,
    fontWeight: '900',
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
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
  },
})
