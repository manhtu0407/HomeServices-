import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { KaelChip } from '@/components/ui/kael-primitives'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import { AlphaStop as Stop, NativeSafeRadialGradient as RadialGradient } from '@/components/ui/svg-alpha-stop'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { isKaelCoreV9Visual, type CustomerV21Visual } from '../ui/assets'
import { customerV21BookingStyles as styles } from './booking-styles'

type CustomerV21BookingTokens = CustomerThemeTokens

export function MediaDescriptionChip({
  label,
  reduceTransparency,
  selected = false,
  testID,
}: {
  label: string
  reduceTransparency: boolean
  selected?: boolean
  testID?: string
}) {
  return (
    <View style={styles.mediaDescriptionChipFrame} testID={testID}>
      <MediaDescriptionChipAura reduceTransparency={reduceTransparency} testID={testID ? `${testID}-mint-aura` : undefined} />
      <KaelChip
        label={label}
        style={styles.mediaDescriptionChip}
        variant={selected ? 'selected' : 'unselected'}
      />
    </View>
  )
}

export function MediaDescriptionChipAura({
  reduceTransparency,
  testID,
}: {
  reduceTransparency: boolean
  testID?: string
}) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaDescriptionChipAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 92 44" width="100%">
        <Defs>
          <RadialGradient id="mediaDescriptionChipAuraFill" cx="50%" cy="48%" r="70%">
            <Stop offset="0" stopColor="rgba(89,236,216,0.28)" />
            <Stop offset="0.72" stopColor="rgba(89,236,216,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaDescriptionChipAuraFill)" height="44" width="92" />
      </Svg>
    </View>
  )
}

export function MediaHeroAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaHeroAura} testID="customer-v21-media-hero-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 190" width="100%">
        <Defs>
          <RadialGradient id="mediaHeroAuraRight" cx="92%" cy="6%" r="70%">
            <Stop offset="0" stopColor="rgba(82,232,211,0.30)" />
            <Stop offset="0.58" stopColor="rgba(148,246,229,0.12)" />
            <Stop offset="0.74" stopColor="rgba(148,246,229,0)" />
          </RadialGradient>
          <RadialGradient id="mediaHeroAuraLeft" cx="7%" cy="88%" r="62%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.18)" />
            <Stop offset="0.72" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaHeroAuraRight)" height="190" width="340" />
        <Rect fill="url(#mediaHeroAuraLeft)" height="190" width="340" />
      </Svg>
    </View>
  )
}

export function MediaPrepAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaPrepAura} testID="customer-v21-media-prep-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 210" width="100%">
        <Defs>
          <RadialGradient id="mediaPrepAuraTop" cx="16%" cy="8%" r="58%">
            <Stop offset="0" stopColor="rgba(151,246,232,0.22)" />
            <Stop offset="0.72" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="mediaPrepAuraBottom" cx="88%" cy="92%" r="68%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.16)" />
            <Stop offset="0.76" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaPrepAuraTop)" height="210" width="340" />
        <Rect fill="url(#mediaPrepAuraBottom)" height="210" width="340" />
      </Svg>
    </View>
  )
}

export function MediaPrepListAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaPrepListAura} testID="customer-v21-media-prep-list-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 320 190" width="100%">
        <Defs>
          <RadialGradient id="mediaPrepListAuraLeft" cx="4%" cy="14%" r="58%">
            <Stop offset="0" stopColor="rgba(93,236,216,0.20)" />
            <Stop offset="0.70" stopColor="rgba(93,236,216,0)" />
          </RadialGradient>
          <RadialGradient id="mediaPrepListAuraRight" cx="98%" cy="80%" r="62%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.14)" />
            <Stop offset="0.76" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaPrepListAuraLeft)" height="190" width="320" />
        <Rect fill="url(#mediaPrepListAuraRight)" height="190" width="320" />
      </Svg>
    </View>
  )
}

export function MediaAnalyzeButtonAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaAnalyzeButtonAura} testID="customer-v21-media-analyze-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 58" width="100%">
        <Defs>
          <RadialGradient id="mediaAnalyzeAuraCenter" cx="50%" cy="50%" r="72%">
            <Stop offset="0" stopColor="rgba(90,236,214,0.36)" />
            <Stop offset="0.68" stopColor="rgba(90,236,214,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaAnalyzeAuraCenter)" height="58" width="340" />
      </Svg>
    </View>
  )
}

export function MediaEvidenceSlot({
  active = false,
  image,
  label,
  testID,
  tokens,
  value,
}: {
  active?: boolean
  image: CustomerV21Visual
  label: string
  testID: string
  tokens: CustomerV21BookingTokens
  value: string
}) {
  return (
    <View
      style={[
        styles.mediaEvidenceSlot,
        active ? styles.mediaEvidenceSlotActive : null,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.82)',
          borderColor: active ? tokens.primary : tokens.border,
        },
      ]}
      testID={testID}
    >
      <MediaEvidenceVisual image={image} />
      <Text numberOfLines={1} style={[styles.mediaSlotLabel, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={[styles.mediaSlotValue, { color: active ? tokens.primary : tokens.text }]}>{value}</Text>
    </View>
  )
}

const MEDIA_VOICE_WAVE_BARS = [8, 17, 12, 23, 15, 10, 18, 13] as const

export function MediaVoiceNote({
  isRecording,
  language,
  onPress,
  recordingSeconds,
  testID,
  tokens,
  value,
}: {
  isRecording: boolean
  language: AppLanguage
  onPress: () => void
  recordingSeconds: number
  testID: string
  tokens: CustomerV21BookingTokens
  value: string
}) {
  const title = isRecording
    ? (language === 'vi' ? 'Đang ghi · chạm để lưu' : 'Recording · tap to save')
    : (language === 'vi' ? 'Ghi chú bằng giọng nói' : 'Voice note')
  return (
    <Pressable
      accessibilityHint={isRecording ? (language === 'vi' ? 'Lưu ghi âm' : 'Save recording') : (language === 'vi' ? 'Bắt đầu ghi âm' : 'Start recording')}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ selected: isRecording }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaVoice,
        pressed ? styles.mediaVoicePressed : null,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : '#FFFFFF',
          borderColor: isRecording ? tokens.primary : tokens.border,
        },
      ]}
      testID={testID}
    >
      <KaelCoreV9 size={30} />
      <View style={styles.mediaVoiceBody}>
        <Text numberOfLines={1} style={[styles.mediaVoiceTitle, { color: tokens.text }]}>{title}</Text>
        <View style={styles.mediaWave} testID="customer-v21-media-wave">
          {MEDIA_VOICE_WAVE_BARS.map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[styles.mediaWaveBar, { backgroundColor: isRecording || index < 3 ? tokens.primary : tokens.border, height: isRecording ? Math.max(8, height + (index % 2 === 0 ? 4 : 0)) : height }]}
            />
          ))}
        </View>
      </View>
      <Text accessibilityLabel={isRecording ? `${recordingSeconds} seconds` : value} style={[styles.mediaVoiceValue, { color: isRecording ? tokens.primary : tokens.muted }]}>{value}</Text>
    </Pressable>
  )
}

function MediaEvidenceVisual({ image }: { image: CustomerV21Visual }) {
  if (isKaelCoreV9Visual(image)) return <KaelCoreV9 size={30} />
  return <Image contentFit="contain" source={image} style={styles.mediaSlotIcon} />
}

export function MediaPrepRow({
  index,
  label,
  state,
  tokens,
  value,
}: {
  index: number
  label: string
  state: 'active' | 'done' | 'idle'
  tokens: CustomerV21BookingTokens
  value: string
}) {
  const highlighted = state === 'active' || state === 'done'
  return (
    <View style={[styles.mediaPrepRow, { backgroundColor: highlighted ? tokens.service : tokens.ghost, borderColor: tokens.border }]}>
      <View style={[styles.mediaPrepState, { backgroundColor: highlighted ? tokens.primary : tokens.raised, borderColor: highlighted ? tokens.primary : tokens.border }]}>
        <Text style={[styles.mediaPrepStateText, { color: highlighted ? tokens.primaryText : tokens.muted }]}>{state === 'done' ? '✓' : String(index)}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.mediaPrepLabel, { color: tokens.text }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.mediaPrepValue, { color: highlighted ? tokens.primary : tokens.muted }]}>{value}</Text>
    </View>
  )
}

export function PrepRow({
  active = false,
  done = false,
  index,
  label,
  tokens,
  value,
}: {
  active?: boolean
  done?: boolean
  index: number
  label: string
  tokens: CustomerV21BookingTokens
  value: string
}) {
  const highlighted = done || active
  return (
    <View style={[styles.prepRow, { backgroundColor: highlighted ? tokens.service : tokens.ghost, borderColor: tokens.border }]}>
      <View style={[styles.prepState, { backgroundColor: highlighted ? tokens.primary : tokens.raised, borderColor: highlighted ? tokens.primary : tokens.border }]}>
        <Text style={[styles.prepStateText, { color: highlighted ? tokens.primaryText : tokens.muted }]}>{done ? '✓' : String(index)}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.prepLabel, { color: tokens.text }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.prepValue, { color: highlighted ? tokens.primary : tokens.muted }]}>{value}</Text>
    </View>
  )
}
