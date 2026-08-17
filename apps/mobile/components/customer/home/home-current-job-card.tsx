import { scaledTypography, typography } from '@/design/theme'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { HomeIcon } from './home-icons'

type HomeCurrentJobCardProps = {
  caseCode: string
  deal: LocalDeal
  language: 'en' | 'vi'
  onOpen: () => void
  problemLabel: string
  scheduleLabel: string
  serviceLabel: string
  statusLabel: string
  step: number
  tokens: CustomerThemeTokens
}

export function HomeCurrentJobCard({ caseCode, deal, language, onOpen, problemLabel, scheduleLabel, serviceLabel, statusLabel, step, tokens }: HomeCurrentJobCardProps) {
  const { width } = useWindowDimensions()
  const compact = width < 640
  const scale = Math.min(Math.max(width - 32, 280) / 829, 1)
  const q = (size: number) => size * scale
  const image = deal.draft.serviceType ? customerV21HomeV4Assets.services[serviceAssetKey(deal.draft.serviceType)] : customerV21HomeV4Assets.hero
  const detailValues = [problemLabel, deal.draft.addressLabel || deal.draft.districtLabel, deal.estimate?.priceRangeLabel]
    .filter((value): value is string => Boolean(value))

  return (
    <Pressable
      accessibilityLabel={`${serviceLabel}. ${statusLabel}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border, borderRadius: q(28), padding: q(12) }]}
      testID="customer-v21-active-case"
    >
      <View style={[styles.primaryRow, { gap: q(14) }]}>
        <View style={[styles.asset, { borderColor: tokens.border, borderRadius: q(20), height: q(82), width: q(82) }]} testID="customer-v21-active-case-asset">
          <Image accessible={false} contentFit="contain" source={image} style={{ height: q(76), width: q(76) }} />
        </View>
        <View style={styles.copy}>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.service, scaledTypography('title2', scale), { color: tokens.text }]}>{serviceLabel}</Text>
          <Text numberOfLines={1} style={[styles.caseCode, scaledTypography('footnote', scale), { color: tokens.muted, marginTop: q(3) }]}>{caseCode}</Text>
        </View>
        <View style={[styles.status, { backgroundColor: tokens.service, borderRadius: q(22), minHeight: q(43), paddingHorizontal: q(18) }]}>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.statusText, scaledTypography('headline', scale), { color: tokens.primary }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={[styles.progress, { marginLeft: compact ? 0 : q(343), marginTop: compact ? q(12) : q(-52), width: compact ? '100%' : q(258) }]} accessibilityLabel={language === 'vi' ? `Bước ${step} trên 4` : `Step ${step} of 4`} testID="customer-v21-active-case-progress">
        <View style={[styles.progressTrack, { backgroundColor: tokens.border, left: q(20), right: q(20), top: q(21) }]} />
        <View style={[styles.progressFill, { backgroundColor: tokens.primary, left: q(20), top: q(21), width: q(progressWidth(step)) }]} />
        {[1, 2, 3, 4].map((number) => {
          const active = number <= step
          return (
            <View key={number} style={[styles.progressNode, { backgroundColor: active ? tokens.primary : tokens.raised, borderColor: active ? tokens.primary : tokens.border, borderRadius: q(21), height: q(41), width: q(41) }]} testID={`customer-v21-active-case-step-${number}`}>
              <Text style={[styles.progressNodeText, scaledTypography('headline', scale), { color: active ? tokens.primaryText : tokens.muted }]}>{number}</Text>
            </View>
          )
        })}
      </View>

      <View style={[styles.meta, { backgroundColor: tokens.ghost, borderColor: tokens.border, borderRadius: q(17), minHeight: q(34), marginLeft: compact ? 0 : q(132), marginTop: q(10), paddingHorizontal: q(18) }]} testID="customer-v21-active-case-meta">
        <View style={[styles.metaItem, { gap: q(10) }]}>
          <HomeIcon color={tokens.muted} name="calendar" size={q(17)} />
          <Text numberOfLines={1} style={[styles.metaText, scaledTypography('footnote', scale), { color: tokens.muted }]}>{scheduleLabel}</Text>
        </View>
        <View style={[styles.metaDivider, { backgroundColor: tokens.border, height: q(18), marginLeft: q(12) }]} />
        <View style={[styles.detailValues, { gap: q(12), marginLeft: q(18) }]}>
          {(detailValues.length > 0 ? detailValues : [language === 'vi' ? 'Kael đang cập nhật thông tin' : 'Kael is updating the details']).map((value) => (
            <Text adjustsFontSizeToFit key={value} minimumFontScale={0.62} numberOfLines={1} style={[styles.metaText, scaledTypography('footnote', scale), { color: tokens.muted }]}>{value}</Text>
          ))}
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
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  caseCode: {
    ...typography.footnote,
    fontWeight: '600',
  },
  card: {
    alignSelf: 'center',
    borderWidth: 1,
    maxWidth: 829,
    overflow: 'hidden',
    width: '100%',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  detailValues: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  metaDivider: {
    width: 1,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  metaText: {
    ...typography.footnote,
    fontWeight: '600',
  },
  primaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 51,
    justifyContent: 'space-between',
    position: 'relative',
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
    ...typography.headline,
  },
  progressTrack: {
    height: 3,
    position: 'absolute',
  },
  service: {
    ...typography.title2,
    fontWeight: '600',
  },
  status: {
    alignItems: 'center',
    flexShrink: 1,
    justifyContent: 'center',
    maxWidth: 150,
  },
  statusText: {
    ...typography.headline,
  },
})
