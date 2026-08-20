import { scaledTypography, typography } from '@/design/theme'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { LocalDeal } from '@nestscout/shared'

import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21BookingWorkartAssets, customerV21HomeV4Assets } from '../ui/assets'
import { customerV21SurfaceContentWidth } from '../ui/shared-styles'
import { useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'
import { HomeIcon } from './home-icons'

const DESIGN_WIDTH = 829
const DESIGN_HEIGHT = 132
const LINE_WIDTH: Record<number, number> = { 1: 0, 2: 82, 3: 164, 4: 218 }
const WORKART_PANEL_WIDTH = 128
const COPY_LEFT = 146

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

function HomeCurrentJobWorkartWash({ gradientID, reduceTransparency, surfaceColor, width }: { gradientID: string; reduceTransparency: boolean; surfaceColor: string; width: number }) {
  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={[styles.workartWash, { pointerEvents: 'none' }]}
      testID="customer-v21-active-case-workart-wash"
      viewBox="0 0 100 120"
      width={width}
    >
      <Defs>
        <LinearGradient id={gradientID} x1="0%" x2="100%" y1="0%" y2="0%">
          <Stop offset="0%" stopColor={surfaceColor} stopOpacity={0} />
          <Stop offset="34%" stopColor={surfaceColor} stopOpacity={reduceTransparency ? 0.18 : 0.05} />
          <Stop offset="72%" stopColor={surfaceColor} stopOpacity={reduceTransparency ? 0.76 : 0.64} />
          <Stop offset="90%" stopColor={surfaceColor} stopOpacity={0.92} />
          <Stop offset="100%" stopColor={surfaceColor} stopOpacity={0.98} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${gradientID})`} height="120" width="100" />
    </Svg>
  )
}

export function HomeCurrentJobCard({ caseCode, deal, language, onOpen, problemLabel, scheduleLabel, serviceLabel, statusLabel, step, tokens }: HomeCurrentJobCardProps) {
  const { width } = useWindowDimensions()
  const { reduceTransparency } = useCustomerV21SurfaceTheme()
  const cardWidth = Math.min(customerV21SurfaceContentWidth(width), DESIGN_WIDTH)
  const scale = cardWidth / DESIGN_WIDTH
  const q = (size: number) => size * scale
  const serviceKey = deal.draft.serviceType ? serviceAssetKey(deal.draft.serviceType) : null
  const image = serviceKey ? customerV21BookingWorkartAssets[serviceKey] : customerV21HomeV4Assets.hero
  const workartSurface = tokens.mode === 'dark' ? tokens.ghost : '#E8F5F1'
  const detailValues = [problemLabel, deal.draft.addressLabel || deal.draft.districtLabel, deal.estimate?.priceRangeLabel]
    .filter((value): value is string => Boolean(value))
  const stepLabel = language === 'vi' ? `Bước ${step} trên 4` : `Step ${step} of 4`
  const detailLabel = detailValues.length > 0 ? detailValues.join('. ') : language === 'vi' ? 'Kael đang cập nhật thông tin' : 'Kael is updating the details'

  return (
    <Pressable
      accessibilityLabel={`${serviceLabel}. ${statusLabel}. ${scheduleLabel}. ${detailLabel}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border, borderRadius: q(28), height: q(DESIGN_HEIGHT), width: cardWidth }]}
      testID="customer-v21-active-case"
    >
      <View style={[styles.workartPanel, { backgroundColor: workartSurface, bottom: 0, left: 0, top: 0, width: q(WORKART_PANEL_WIDTH) }]} testID="customer-v21-active-case-workart-panel">
        <Image accessibilityIgnoresInvertColors accessible={false} contentFit="cover" source={image} style={styles.workartImage} testID="customer-v21-active-case-workart" />
        <HomeCurrentJobWorkartWash
          gradientID="customer-v21-active-case-workart-wash"
          reduceTransparency={reduceTransparency}
          surfaceColor={tokens.raised}
          width={q(42)}
        />
      </View>

      <View style={[styles.copy, { left: q(COPY_LEFT), top: q(24), width: q(181) }]} testID="customer-v21-active-case-copy">
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.service, scaledTypography('title2', scale), { color: tokens.text }]}>{serviceLabel}</Text>
        <Text numberOfLines={1} style={[styles.caseCode, scaledTypography('footnote', scale), { color: tokens.muted, marginTop: q(3) }]}>{caseCode}</Text>
      </View>

      <View style={[styles.status, { backgroundColor: tokens.service, borderRadius: q(22), left: q(343), maxWidth: q(160), minHeight: q(43), minWidth: q(132), paddingHorizontal: q(18), top: q(27) }]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.55} numberOfLines={1} style={[styles.statusText, scaledTypography('headline', scale), { color: tokens.primary }]}>{statusLabel}</Text>
      </View>

      <View accessibilityLabel={stepLabel} style={[styles.progress, { height: q(51), left: q(527), top: q(22), width: q(258) }]} testID="customer-v21-active-case-progress">
        <View style={[styles.progressTrack, { backgroundColor: tokens.border, height: q(3), left: q(20), right: q(20), top: q(24) }]} testID="customer-v21-active-case-progress-track" />
        <View style={[styles.progressFill, { backgroundColor: tokens.primary, height: q(3), left: q(20), top: q(24), width: q(LINE_WIDTH[Math.min(Math.max(step, 1), 4)]) }]} testID="customer-v21-active-case-progress-fill" />
        {[1, 2, 3, 4].map((number) => {
          const active = number <= step
          return (
            <View key={number} style={[styles.progressNode, { backgroundColor: active ? tokens.primary : tokens.raised, borderColor: active ? tokens.primary : tokens.border, borderRadius: q(21), borderWidth: active ? 0 : q(2), height: q(41), width: q(41) }]} testID={`customer-v21-active-case-step-${number}`}>
              <Text style={[styles.progressNodeText, scaledTypography('headline', scale), { color: active ? tokens.primaryText : tokens.muted }]}>{number}</Text>
            </View>
          )
        })}
      </View>

      <View style={[styles.meta, { backgroundColor: tokens.ghost, borderColor: tokens.border, borderRadius: q(17), bottom: q(11), height: q(34), left: q(132), paddingHorizontal: q(18), right: q(30) }]} testID="customer-v21-active-case-meta">
        <View style={[styles.metaItem, styles.metaDate, { gap: q(10), height: q(18) }]} testID="customer-v21-active-case-meta-date">
          <HomeIcon color={tokens.muted} name="calendar" size={q(17)} />
          <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.metaText, scaledTypography('footnote', scale), { color: tokens.muted, lineHeight: q(18) }]}>{scheduleLabel}</Text>
        </View>
        <View style={[styles.metaDivider, { backgroundColor: tokens.border, height: q(18), marginLeft: q(12) }]} />
        <View style={[styles.detailValues, { height: q(18), marginLeft: q(18) }]} testID="customer-v21-active-case-meta-details">
          <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.metaText, styles.metaDetailLine, scaledTypography('footnote', scale), { color: tokens.muted, lineHeight: q(18) }]} testID="customer-v21-active-case-meta-detail-line">
            {detailValues.length > 0 ? detailValues.join(' · ') : language === 'vi' ? 'Kael đang cập nhật thông tin' : 'Kael is updating the details'}
          </Text>
        </View>
      </View>
    </Pressable>
  )
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
  workartImage: {
    height: '100%',
    width: '100%',
  },
  workartPanel: {
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 0,
  },
  workartWash: {
    bottom: 0,
    position: 'absolute',
    right: -1,
    top: 0,
    zIndex: 1,
  },
  caseCode: {
    ...typography.footnote,
    fontWeight: '600',
  },
  card: {
    alignSelf: 'center',
    borderWidth: 1,
    maxWidth: DESIGN_WIDTH,
    overflow: 'hidden',
    position: 'relative',
  },
  copy: {
    position: 'absolute',
  },
  detailValues: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  meta: {
    alignItems: 'center',
    borderWidth: 1,
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
  },
  metaDate: {
    flexShrink: 0,
    maxWidth: '30%',
  },
  metaDetailLine: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'left',
  },
  metaText: {
    flexShrink: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
    ...typography.footnote,
    fontWeight: '600',
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 51,
    justifyContent: 'space-between',
    position: 'absolute',
  },
  progressFill: {
    height: 3,
    position: 'absolute',
  },
  progressNode: {
    alignItems: 'center',
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
    justifyContent: 'center',
    maxWidth: 160,
    position: 'absolute',
  },
  statusText: {
    ...typography.headline,
  },
})
