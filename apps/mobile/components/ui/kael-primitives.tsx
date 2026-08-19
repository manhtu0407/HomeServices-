import { useId, type ReactNode, type Ref } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native'
import Svg, { Defs, Path, Rect } from 'react-native-svg'
import { aura, color, component, shadow, spacing, typography } from '@/design/theme'
import { useGlassAccessibility } from './accessibility-motion'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient, NativeSafeRadialGradient as RadialGradient } from './svg-alpha-stop'

type KaelButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type KaelChipVariant = 'selected' | 'unselected' | 'successStatus' | 'warning' | 'error'

const webTextInputNoOutline = {
  backgroundColor: 'transparent',
  outlineColor: 'transparent',
  outlineStyle: 'none',
  outlineWidth: 0,
  WebkitBoxShadow: `0 0 0 1000px ${component.input.bg} inset`,
  WebkitTextFillColor: color.text.primary,
} as unknown as TextStyle

type KaelTextInputProps = TextInputProps & { ref?: Ref<TextInput> }

export function KaelTextInput({ ref, style, ...inputProps }: KaelTextInputProps) {
  return <TextInput {...inputProps} ref={ref} style={[webTextInputNoOutline, styles.inputFontMetrics, inputProps.multiline ? null : styles.singleLineInput, style]} />
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
          style={[styles.input, webTextInputNoOutline, mode === 'search' ? styles.searchInput : null, inputProps.multiline ? null : styles.singleLineInput, style]}
          {...inputProps}
        />
      </View>
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

const sharedButtonText: TextStyle = {
  ...typography.label,
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
    ...typography.label,
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
    ...typography.label,
  },
  fieldStack: {
    gap: spacing.xs,
  },
  input: {
    color: color.text.primary,
    flex: 1,
    ...typography.body,
    includeFontPadding: false,
    minHeight: component.input.height - 2,
    padding: 0,
  },
  inputFontMetrics: {
    includeFontPadding: false,
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
  pressed: {
    opacity: 0.78,
  },
  searchInput: {
    minHeight: component.input.height - 2,
  },
  singleLineInput: {
    textAlignVertical: 'center',
  },
})
