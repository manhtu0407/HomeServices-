import type { ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { localizedStatusLabel, type AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
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

export function WorkerV5SuggestionChips({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.suggestionChipRow} testID="worker-v5-suggestion-chips">
      {items.map((item, index) => (
        <View key={item} style={styles.suggestionChip}>
          <Text style={styles.suggestionChipText} numberOfLines={2} testID={`worker-v5-suggestion-chip-text-${index}`}>{item}</Text>
        </View>
      ))}
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
  zipAura: WorkerV5CaseAuraComponent
}) {
  const primaryIsDisabled = primaryDisabled || !onPrimary
  const primaryUsesSourceTone = primaryVariant === 'source'
  return (
    <View accessibilityRole="summary" style={styles.navigationRow} testID="worker-v5-action-rail">
      {formulaAura && !reduceTransparency ? (
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
          reduceTransparency && styles.opaqueCard,
          pressed && onSecondary ? styles.pressed : null,
        ]}
        testID={secondaryTestID}
      >
        <Text adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.navButtonText, styles.actionRailButtonText]} numberOfLines={1}>{secondary}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryIsDisabled }}
        disabled={primaryIsDisabled}
        onPress={onPrimary}
        style={({ pressed }) => [
          styles.navButton,
          styles.navButtonPrimary,
          primaryUsesSourceTone && styles.primaryActionButtonSource,
          reduceTransparency && (primaryUsesSourceTone ? styles.primaryActionButtonSource : styles.opaqueCard),
          primaryIsDisabled && (primaryUsesSourceTone ? styles.sourceActionDisabled : styles.navButtonDisabled),
          pressed && !primaryIsDisabled ? styles.pressed : null,
        ]}
        testID={primaryTestID}
      >
        {primaryUsesSourceTone ? <PrimaryButtonFill disabled={primaryIsDisabled} variant="source" /> : null}
        <Text
          style={[
            styles.navButtonText,
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
  testID,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  primaryButtonFill: WorkerV5PrimaryButtonFillComponent
  reduceTransparency: boolean
  testID: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryActionButton,
        styles.primaryActionButtonSource,
        reduceTransparency && styles.primaryActionButtonSource,
        disabled && styles.sourceActionDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <PrimaryButtonFill disabled={disabled} variant="source" />
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

export function WorkerV5OnsiteAdvisoryRail({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const status = deal
    ? localizedStatusLabel(deal.status, language)
    : textByLanguage(language, 'Chưa có việc', 'No work')
  const area = deal?.draft.districtLabel || deal?.broadcast?.generalArea ||
    textByLanguage(language, 'khu vực chưa rõ', 'unknown area')

  return (
    <View style={[styles.onsiteAdvisoryRail, reduceTransparency && styles.opaqueCard]} testID="worker-onsite-advisory-rail">
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-status">
        {textByLanguage(language, `Trạng thái sửa chữa: ${status}`, `Work status: ${status}`)}
      </Text>
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-address">
        {textByLanguage(language, `Khu vực làm việc: ${area}`, `Service area: ${area}`)}
      </Text>
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-scope">
        {textByLanguage(language, 'Không nhập giá trong chat; phát sinh phải đi qua luồng đổi phạm vi.', 'Do not enter prices in chat; scope changes must use the controlled flow.')}
      </Text>
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-evidence">
        {textByLanguage(language, 'Ghi chú và ảnh chỉ hỗ trợ Kael tư vấn, không tự cập nhật trạng thái.', 'Notes and photos only help Kael advise; they do not update status automatically.')}
      </Text>
    </View>
  )
}
