import type { ComponentType } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { PlacesAutocompleteResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { styles } from './source-styles'

export type WorkerV5PlaceSuggestion = PlacesAutocompleteResponse['suggestions'][number]
export type WorkerV5InboxTabId = 'matches' | 'new' | 'saved'

type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SourceRowList({
  auraTestID,
  caseWideAura: CaseWideAura,
  icons,
  reduceTransparency,
  rows,
  scope,
  testID,
  variant = 'default',
  zipAura: ZipAura,
}: {
  auraTestID?: string
  caseWideAura: WorkerV5CaseAuraComponent
  icons: WorkerV5IconMap
  reduceTransparency: boolean
  rows: ReadonlyArray<{ icon: WorkerV5IconName; meta: string; status: string; title: string }>
  scope?: string
  testID: string
  variant?: 'default' | 'shift'
  zipAura: WorkerV5CaseAuraComponent
}) {
  return (
    <View style={[styles.approvalDecisionList, variant === 'shift' && styles.shiftSourceList, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency && variant === 'shift' ? (
        <>
          <CaseWideAura scope={`${scope ?? testID}Wide`} testID={auraTestID} />
          <ZipAura scope={`${scope ?? testID}Fine`} testID={auraTestID ? `${auraTestID}-zip` : undefined} />
        </>
      ) : !reduceTransparency && auraTestID ? (
        <MintAura intensity="component" style={styles.shiftSourceAura} testID={auraTestID} />
      ) : null}
      {rows.map((row) => (
        <View key={`${row.title}-${row.status}`} style={[styles.approvalDecisionRow, variant === 'shift' && styles.shiftSourceRow]}>
          <View style={styles.approvalDecisionIconShell}>
            <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
            <Image resizeMode="contain" source={icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={[styles.approvalDecisionTitle, variant === 'shift' && styles.shiftSourceTitle]} numberOfLines={2}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2}>{row.meta}</Text>
          </View>
          <Text style={[styles.approvalDecisionStatus, variant === 'shift' && styles.shiftSourceStatus]} numberOfLines={1}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5ShiftSummaryCard({
  caseWideAura: CaseWideAura,
  icon,
  icons,
  meta,
  reduceTransparency,
  title,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CaseAuraComponent
  icon: WorkerV5IconName
  icons: WorkerV5IconMap
  meta: string
  reduceTransparency: boolean
  title: string
  zipAura: WorkerV5CaseAuraComponent
}) {
  return (
    <View style={[styles.shiftSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-shift-summary-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="ShiftSummaryWide" testID="worker-v5-shift-summary-mint-aura" />
          <ZipAura scope="ShiftSummaryFine" testID="worker-v5-shift-summary-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.shiftIconTile} testID="worker-v5-shift-top-calendar-icon">
        {!reduceTransparency ? (
          <ZipAura
            scope="ShiftSummaryIconFormula"
            style={styles.shiftIconFormulaAura}
            testID="worker-v5-shift-icon-formula-mint-aura"
          />
        ) : null}
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={icons[icon]} style={styles.shiftIcon} />
      </View>
      <View style={[styles.shiftTextColumn, styles.shiftSummaryTextColumn]}>
        <Text style={[styles.shiftTitle, styles.shiftSummaryTitle]} numberOfLines={1} testID="worker-v5-shift-summary-title">{title}</Text>
        <Text style={styles.shiftMeta} numberOfLines={2} testID="worker-v5-shift-summary-meta">{meta}</Text>
      </View>
    </View>
  )
}

export function WorkerV5SearchPill({
  fallbackUsed,
  language,
  onChangeText,
  onSelectSuggestion,
  pending,
  placeholder,
  reduceTransparency,
  suggestions,
  value,
}: {
  fallbackUsed: boolean
  language: AppLanguage
  onChangeText: (value: string) => void
  onSelectSuggestion: (suggestion: WorkerV5PlaceSuggestion) => void
  pending: boolean
  placeholder: string
  reduceTransparency: boolean
  suggestions: WorkerV5PlaceSuggestion[]
  value: string
}) {
  return (
    <View style={styles.searchStack} testID="worker-v5-search-pill">
      <KaelTextField
        autoCapitalize="words"
        inputShellStyle={[styles.searchPill, reduceTransparency && styles.opaqueCard]}
        inputShellTestID="worker-v5-search-input-shell"
        mode="search"
        onChangeText={onChangeText}
        placeholder={placeholder}
        shellStyle={styles.searchFieldStack}
        style={styles.searchInput}
        testID="worker-v5-search-input"
        value={value}
      />
      {pending ? (
        <Text style={styles.searchFeedback} testID="worker-v5-search-loading">
          {textByLanguage(language, 'Đang tìm trên VietMap...', 'Searching VietMap...')}
        </Text>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={[styles.searchSuggestions, reduceTransparency && styles.opaqueCard]} testID="worker-v5-search-suggestions">
          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.place_id}
              onPress={() => onSelectSuggestion(suggestion)}
              style={({ pressed }) => [styles.searchSuggestionButton, pressed ? styles.pressed : null]}
              testID="worker-v5-search-suggestion"
            >
              <Text numberOfLines={1} style={styles.searchSuggestionTitle}>{suggestion.main_text}</Text>
              {suggestion.secondary_text ? (
                <Text numberOfLines={1} style={styles.searchSuggestionMeta}>{suggestion.secondary_text}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {fallbackUsed && !pending ? (
        <Text style={styles.searchFeedback} testID="worker-v5-search-fallback">
          {textByLanguage(language, 'Chưa lấy được tọa độ VietMap thật cho lựa chọn này.', 'No real VietMap coordinates yet for this selection.')}
        </Text>
      ) : null}
    </View>
  )
}

export function WorkerV5ScheduleSummaryCard({
  amount,
  caseWideAura: CaseWideAura,
  lensLabel,
  lensValue,
  meta,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  amount: string
  caseWideAura: WorkerV5CaseAuraComponent
  lensLabel: string
  lensValue: string
  meta: string
  reduceTransparency: boolean
  zipAura: WorkerV5CaseAuraComponent
}) {
  return (
    <View style={[styles.scheduleSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-schedule-summary-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="SmartScheduleSummaryWide" style={styles.scheduleSummaryAura} testID="worker-v5-schedule-summary-mint-aura" />
          <ZipAura scope="SmartScheduleSummaryFine" style={styles.scheduleSummaryZipAura} testID="worker-v5-schedule-summary-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.scheduleSummaryCopy}>
        <Text style={styles.scheduleSummaryAmount} numberOfLines={1}>{amount}</Text>
        <Text style={styles.scheduleSummaryMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={styles.scheduleSummaryLens}>
        <Text style={styles.scheduleSummaryLensValue} numberOfLines={1}>{lensValue}</Text>
        <Text style={styles.scheduleSummaryLensLabel} numberOfLines={2}>{lensLabel}</Text>
      </View>
    </View>
  )
}

export function WorkerV5SourceProgressBar({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={styles.sourceProgressShell} testID="worker-v5-opportunity-progress">
      <View style={[styles.sourceProgressFill, active ? styles.sourceProgressFillActive : null]} />
      <Text style={styles.sourceProgressText} numberOfLines={1}>{label}</Text>
    </View>
  )
}
