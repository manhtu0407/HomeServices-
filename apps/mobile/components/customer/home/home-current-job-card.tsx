import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { HomeIcon } from './home-icons'

type HomeCurrentJobCardProps = {
  caseCode: string
  deal: LocalDeal
  durationLabel?: string
  language: 'en' | 'vi'
  onOpen: () => void
  scheduleLabel: string
  serviceLabel: string
  statusLabel: string
  step: number
  tokens: CustomerThemeTokens
}

export function HomeCurrentJobCard({ caseCode, deal, durationLabel, language, onOpen, scheduleLabel, serviceLabel, statusLabel, step, tokens }: HomeCurrentJobCardProps) {
  const { width } = useWindowDimensions()
  const scale = Math.min(Math.max(width - 32, 280) / 829, 1)
  const q = (size: number) => size * scale
  const image = deal.draft.serviceType === 'cleaning'
    ? customerV21HomeV4Assets.taskCleaning
    : deal.draft.serviceType
      ? customerV21HomeV4Assets.services[serviceAssetKey(deal.draft.serviceType)]
      : customerV21HomeV4Assets.hero
  const resolvedDurationLabel = durationLabel ?? (language === 'vi' ? 'Thời gian dự kiến: đang cập nhật' : 'Estimated duration: updating')

  return (
    <Pressable
      accessibilityLabel={`${serviceLabel}. ${statusLabel}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.card, {
        backgroundColor: tokens.raised,
        borderColor: tokens.border,
        borderRadius: q(28),
        height: q(132),
        marginTop: q(8),
        width: q(829),
      }]}
      testID="customer-v21-active-case"
    >
      <Image
        accessible={false}
        contentFit="contain"
        source={image}
        style={[styles.asset, { height: q(82), left: q(27), top: q(15), width: q(82) }]}
        testID="customer-v21-active-case-asset"
      />

      <View style={[styles.copy, { left: q(132), top: q(24), width: q(190) }]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.service, { color: tokens.text, fontSize: q(23), lineHeight: q(28) }]}>{serviceLabel}</Text>
        <Text numberOfLines={1} style={[styles.caseCode, { color: tokens.muted, fontSize: q(18), lineHeight: q(22), marginTop: q(3) }]}>{caseCode}</Text>
      </View>

      <View testID="customer-v21-active-case-status" style={[styles.status, { backgroundColor: tokens.statusSurface, borderRadius: q(22), height: q(43), left: q(343), minWidth: q(132), paddingHorizontal: q(18), top: q(27) }]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.statusText, { color: tokens.statusText, fontSize: q(17) }]}>{statusLabel}</Text>
      </View>

      <View style={[styles.progress, { height: q(51), left: q(527), top: q(22), width: q(258) }]} accessibilityLabel={language === 'vi' ? `Bước ${step} trên 4` : `Step ${step} of 4`} testID="customer-v21-active-case-progress">
        <View style={[styles.progressTrack, { backgroundColor: tokens.progressTrack, left: q(20), right: q(20), top: q(21) }]} testID="customer-v21-active-case-progress-track" />
        <View style={[styles.progressFill, { backgroundColor: tokens.progressActive, left: q(20), top: q(21), width: q(progressWidth(step)) }]} testID="customer-v21-active-case-progress-fill" />
        {[1, 2, 3, 4].map((number) => {
          const active = number <= step
          return (
            <View key={number} style={[styles.progressNode, { backgroundColor: active ? tokens.progressActive : tokens.raised, borderColor: tokens.progressBorder, borderRadius: q(21), borderWidth: active ? 0 : q(2), height: q(41), width: q(41) }]} testID={`customer-v21-active-case-step-${number}`}>
              <Text style={[styles.progressNodeText, { color: active ? tokens.primaryText : tokens.progressInactiveText, fontSize: q(17) }]}>{number}</Text>
            </View>
          )
        })}
      </View>

      <View style={[styles.meta, { backgroundColor: tokens.ghost, borderColor: tokens.border, borderRadius: q(17), bottom: q(11), height: q(34), left: q(132), right: q(30) }]} testID="customer-v21-active-case-meta">
        <View style={[styles.metaItem, { gap: q(10), paddingHorizontal: q(18) }]}>
          <HomeIcon color={tokens.muted} name="calendar" size={q(17)} />
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.metaText, { color: tokens.muted, fontSize: q(15) }]}>{scheduleLabel}</Text>
        </View>
        <View style={[styles.metaDivider, { backgroundColor: tokens.border, height: q(18), marginLeft: q(12) }]} />
        <View style={[styles.metaItem, styles.detailValues, { gap: q(10), marginLeft: q(18), paddingHorizontal: q(18) }]}>
          <HomeIcon color={tokens.muted} name="clock" size={q(17)} />
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.metaText, { color: tokens.muted, fontSize: q(15) }]}>{resolvedDurationLabel}</Text>
        </View>
      </View>
    </Pressable>
  )
}

function progressWidth(step: number) {
  if (step <= 1) return 0
  if (step === 2) return 82
  if (step === 3) return 164
  return 218
}

function serviceAssetKey(service: NonNullable<LocalDeal['draft']['serviceType']>) {
  if (service === 'cleaning') return 'home_cleaning'
  if (service === 'electrical') return 'electrical'
  if (service === 'handyman') return 'handyman_minor_installation'
  if (service === 'hvac') return 'hvac_basic_maintenance'
  if (service === 'plumbing') return 'plumbing'
  return 'upholstery_care'
}

const styles = StyleSheet.create({
  asset: {
    position: 'absolute',
  },
  card: {
    alignSelf: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  caseCode: {
    fontWeight: '600',
  },
  copy: {
    position: 'absolute',
  },
  detailValues: {
    flex: 1,
    minWidth: 0,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'absolute',
  },
  metaDivider: {
    width: 1,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 18,
  },
  metaText: {
    flexShrink: 1,
    fontWeight: '600',
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
  },
  progressFill: {
    height: 3,
    position: 'absolute',
  },
  progressNode: {
    alignItems: 'center',
    borderWidth: 2,
    justifyContent: 'center',
    zIndex: 1,
  },
  progressNodeText: {
    fontWeight: '800',
  },
  progressTrack: {
    height: 3,
    position: 'absolute',
  },
  service: {
    fontWeight: '800',
  },
  status: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  statusText: {
    fontWeight: '800',
  },
})
