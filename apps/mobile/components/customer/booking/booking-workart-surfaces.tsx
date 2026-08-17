import { Fragment } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'
import { type CustomerServiceId } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { customerV21Assets, customerV21BookingWorkartAssets } from '../ui/assets'
import { customerV21BookingServiceCopy } from '../ui/copy'
import { useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'

type BookingWorkartJourneyProps = {
  artworkHeight?: number
  copyScale?: number
  language: AppLanguage
  testID?: string
  tokens: CustomerThemeTokens
}

type BookingWorkartServiceTileProps = {
  language: AppLanguage
  onPress?: () => void
  selected?: boolean
  service: CustomerServiceId
  testID?: string
  tileHeight?: number
  tokens: CustomerThemeTokens
}

function BookingWorkartServiceWash({
  gradientID,
  reduceTransparency,
  surfaceColor,
}: {
  gradientID: string
  reduceTransparency: boolean
  surfaceColor: string
}) {
  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={[bookingStyles.bookingWorkartServiceWash, { pointerEvents: 'none' }]}
      viewBox="0 0 100 120"
      width={42}
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

function BookingJourneyBackdropFade({ color, gradientID }: { color: string; gradientID: string }) {
  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={bookingStyles.bookingJourneyBackdropFade}
      viewBox="0 0 100 100"
      width="100%"
    >
      <Defs>
        <LinearGradient id={gradientID} x1="0%" x2="0%" y1="0%" y2="100%">
          <Stop offset="0%" stopColor={color} stopOpacity={0} />
          <Stop offset="76%" stopColor={color} stopOpacity={0.04} />
          <Stop offset="100%" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${gradientID})`} height="100" width="100" />
    </Svg>
  )
}

export function BookingWorkartJourney({ artworkHeight = 140, copyScale = 1, language, testID = 'customer-v21-booking-progress', tokens }: BookingWorkartJourneyProps) {
  const isVietnamese = language === 'vi'
  const backdropFadeGradientID = `${testID}-backdrop-fade`.replace(/[^A-Za-z0-9_-]/g, '-')
  return (
    <Fragment>
      <View
        style={[
          bookingStyles.bookingJourneyArtworkFrame,
          { height: artworkHeight, minHeight: artworkHeight },
        ]}
        testID={`${testID}-artwork-frame`}
      >
        <Image
          accessibilityIgnoresInvertColors
          contentFit="cover"
          source={customerV21Assets.bookingJourneyWorkart}
          style={[bookingStyles.bookingJourneyArtwork, { height: artworkHeight }]}
          testID={`${testID}-artwork`}
        />
        <BookingJourneyBackdropFade color={tokens.canvas} gradientID={backdropFadeGradientID} />
      </View>
      <View
        accessible
        accessibilityLabel={isVietnamese
          ? 'Bước 1 trên 4: bắt đầu với dịch vụ. Chọn dịch vụ, chọn thời gian, thêm thông tin và xác nhận.'
          : 'Step 1 of 4: start with a service. Choose a service, choose a time, add details, and confirm.'}
        style={[
          bookingStyles.bookingJourneyCopy,
          {
            gap: Math.max(1, Math.round(copyScale)),
            paddingBottom: Math.round(7 * copyScale),
            paddingHorizontal: Math.round(16 * copyScale),
            paddingTop: Math.round(6 * copyScale),
          },
        ]}
        testID={testID}
      >
        <Text style={[bookingStyles.bookingJourneyTitle, { color: tokens.primary, fontSize: Math.round(17 * copyScale), lineHeight: Math.round(21 * copyScale) }]}>
          {isVietnamese ? 'Bắt đầu với dịch vụ' : 'Start with a service'}
        </Text>
        <Text style={[bookingStyles.bookingJourneyCaption, { color: tokens.muted, fontSize: 11.5 * copyScale, lineHeight: Math.round(16 * copyScale) }]}>
          {isVietnamese ? 'Chọn dịch vụ, chọn thời gian, Kael sẽ sắp xếp giúp bạn.' : 'Choose a service and time. Kael will help arrange the next steps.'}
        </Text>
      </View>
    </Fragment>
  )
}

export function BookingWorkartServiceTile({
  language,
  onPress,
  selected = false,
  service,
  testID,
  tileHeight,
  tokens,
}: BookingWorkartServiceTileProps) {
  const { reduceMotion, reduceTransparency } = useCustomerV21SurfaceTheme()
  const copy = customerV21BookingServiceCopy[language][service]
  const serviceTestID = testID ?? `customer-v21-service-${service}`
  const surfaceColor = selected ? tokens.service : tokens.raised
  const washGradientID = `${serviceTestID}-workart-wash`.replace(/[^A-Za-z0-9_-]/g, '-')

  return (
    <Pressable
      accessibilityLabel={`${copy.label}. ${copy.note}`}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        bookingStyles.bookingWorkartServiceTile,
        {
          backgroundColor: surfaceColor,
          borderColor: selected ? tokens.primary : tokens.border,
          minHeight: tileHeight,
          opacity: pressed && !reduceMotion ? 0.84 : 1,
          transform: [{ scale: pressed && !reduceMotion ? 0.985 : 1 }],
        },
      ]}
      testID={serviceTestID}
    >
      <View
        style={[
          bookingStyles.bookingWorkartServiceVisualPanel,
          {
            backgroundColor: selected ? tokens.service : tokens.mode === 'dark' ? tokens.ghost : '#E8F5F1',
            minHeight: tileHeight,
          },
        ]}
        testID={`${serviceTestID}-visual-panel`}
      >
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={copy.label}
          contentFit="cover"
          source={customerV21BookingWorkartAssets[service]}
          style={bookingStyles.bookingWorkartServiceArtwork}
          testID={`${serviceTestID}-icon`}
        />
        <BookingWorkartServiceWash gradientID={washGradientID} reduceTransparency={reduceTransparency} surfaceColor={surfaceColor} />
      </View>
      <View
        style={[
          bookingStyles.bookingWorkartServiceCopy,
          { zIndex: 2 },
        ]}
        testID={`${serviceTestID}-copy`}
      >
        <View style={bookingStyles.bookingWorkartServiceHeading} testID={`${serviceTestID}-heading`}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={2}
            style={[bookingStyles.bookingWorkartServiceTitle, { color: tokens.text }]}
            testID={`${serviceTestID}-title`}
          >
            {copy.label}
          </Text>
        </View>
        <View style={bookingStyles.bookingWorkartServiceDetailRail} testID={`${serviceTestID}-detail-rail`}>
          {copy.details.map((detail, index) => (
            <Fragment key={detail}>
              {index > 0 ? <Text style={[bookingStyles.bookingWorkartServiceDetailSeparator, { color: tokens.subtleText }]}>·</Text> : null}
              <View style={bookingStyles.bookingWorkartServiceDetailRow}>
                <Text numberOfLines={1} style={[bookingStyles.bookingWorkartServiceDetail, { color: tokens.muted }]} testID={`${serviceTestID}-detail-${index}`}>{detail}</Text>
              </View>
            </Fragment>
          ))}
        </View>
      </View>
    </Pressable>
  )
}
