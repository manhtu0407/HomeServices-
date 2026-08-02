import { Fragment, useEffect, type ComponentType, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { Appearance, Pressable, ScrollView, Text, useWindowDimensions, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import type { CustomerServiceId } from '@nestscout/shared'
import { GlassSurface } from '@/components/ui/glass-surface'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import { useAppLanguage } from '@/lib/app-language'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
  type CustomerThemeTokens,
} from '../customer-theme'
import { CaseWideMintAura, CustomerScreenCanvasAura, HomeEmptySourceAura, SourceCardSkin, SourceIconAura, SourceIconTileSkin, ZipMintAura } from './aura-surfaces'
import { customerV21BookingServiceAssets, isKaelCoreV9Visual, type CustomerV21Visual } from './assets'
import { customerV21BookingServiceCopy } from './copy'
import { customerV21SharedStyles as styles } from './shared-styles'
import { type CustomerV21ScreenId } from './types'

export function useCustomerV21SurfaceTheme() {
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(mode)
  const tokens = glass.reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  return { mode, reduceMotion: glass.reduceMotion, reduceTransparency: glass.reduceTransparency, tokens }
}

export function CustomerThemeSystemBar({ mode }: { mode: CustomerThemeTokens['mode'] }) {
  useEffect(() => {
    StatusBar.setStyle(mode === 'dark' ? 'light' : 'dark')
    return () => {
      StatusBar.setStyle(Appearance.getColorScheme() === 'dark' ? 'light' : 'dark')
    }
  }, [mode])

  return null
}

type CustomerV21AssetTile = ComponentType<{
  bare?: boolean
  image: CustomerV21Visual
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}>

export function AssetTile({
  bare = false,
  image,
  label,
  size = 52,
  sourceAura = false,
  style,
  testID,
}: {
  bare?: boolean
  image: CustomerV21Visual
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  if (sourceAura) {
    return (
      <View accessibilityLabel={label} style={[styles.sourceIconAuraFrame, style]} testID={testID}>
        <SourceIconAura />
        <View style={[styles.assetTile, styles.sourceIconTile, { backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'transparent', borderColor: 'rgba(255,255,255,0.95)' }]}>
          <SourceIconTileSkin />
          <CustomerV21AssetVisual image={image} reduceMotion={reduceMotion} size={size} />
        </View>
      </View>
    )
  }

  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.assetTile,
        bare ? styles.bareAssetTile : { backgroundColor: tokens.ghost, borderColor: tokens.border },
        style,
      ]}
      testID={testID}
    >
      <CustomerV21AssetVisual image={image} reduceMotion={reduceMotion} size={size} />
    </View>
  )
}

function CustomerV21AssetVisual({
  image,
  reduceMotion,
  size,
}: {
  image: CustomerV21Visual
  reduceMotion: boolean
  size: number
}) {
  if (isKaelCoreV9Visual(image)) return <KaelCoreV9 reduceMotion={reduceMotion} size={size} />
  return <Image contentFit="contain" source={image} style={{ height: size, width: size }} />
}

export function SectionActionHeader({
  action,
  onAction,
  title,
  titleTestID,
}: {
  action?: string
  onAction?: () => void
  title: string
  titleTestID?: string
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <View style={[styles.sectionActionHeader, action ? styles.sectionActionHeaderWithAction : null]}>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.sectionTitle, styles.sectionActionTitle, { color: tokens.text }]} testID={titleTestID}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionActionButton}>
          <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.sectionActionText, { color: tokens.primary }]}>{action}</Text>
        </Pressable>
      ) : action ? (
        <View style={styles.sectionActionButton}>
          <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.sectionActionText, { color: tokens.primary }]}>{action}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function ServiceTile({
  fullWidth = false,
  homeAura = false,
  onPress,
  selected,
  service,
  testID,
}: {
  fullWidth?: boolean
  homeAura?: boolean
  onPress?: () => void
  selected?: boolean
  service: CustomerServiceId
  testID?: string
}) {
  const language = useAppLanguage()
  const { reduceMotion, reduceTransparency, tokens } = useCustomerV21SurfaceTheme()
  const { width: viewportWidth } = useWindowDimensions()
  const copy = customerV21BookingServiceCopy[language][service]
  const serviceTestID = testID ?? `customer-v21-service-${service}`

  return (
    <Pressable
      accessibilityLabel={`${copy.label}. ${copy.note}`}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: Boolean(selected) }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceTile,
        homeAura ? styles.homeAuraServiceTile : null,
        homeAura ? (fullWidth || viewportWidth < 680 ? styles.homeAuraServiceTileNarrow : styles.homeAuraServiceTileWide) : null,
        {
          backgroundColor: homeAura
            ? reduceTransparency || tokens.mode === 'dark' ? tokens.raised : 'transparent'
            : selected ? tokens.service : tokens.raised,
          borderColor: selected
            ? (homeAura ? 'rgba(64,215,193,0.62)' : tokens.primary)
            : homeAura ? (tokens.mode === 'dark' ? tokens.border : 'rgba(204,223,219,0.94)') : tokens.border,
          opacity: pressed && !reduceMotion ? 0.84 : 1,
          transform: [{ scale: pressed && !reduceMotion ? 0.98 : 1 }],
        },
      ]}
      testID={serviceTestID}
    >
      {homeAura ? (
        <>
          {tokens.mode === 'dark' ? null : <SourceCardSkin testID={`${serviceTestID}-skin`} />}
          {selected ? (
            <View pointerEvents="none" style={styles.homeServiceFormulaMintAura} testID={`${serviceTestID}-formula-mint-aura`}>
              <CaseWideMintAura
                intensity="strong"
                scope={`ServiceTile${service}Wide`}
                testID={`${serviceTestID}-wide-mint-aura`}
              />
              <ZipMintAura scope={`ServiceTile${service}Fine`} testID={`${serviceTestID}-mint-aura`} />
            </View>
          ) : null}
          <View
            style={[
              styles.homeServiceVisualPanel,
              {
                backgroundColor: selected
                  ? tokens.service
                  : tokens.mode === 'dark' ? tokens.ghost : 'rgba(232,250,247,0.90)',
                borderRightColor: tokens.mode === 'dark' ? tokens.border : 'rgba(198,222,218,0.92)',
              },
            ]}
            testID={`${serviceTestID}-visual-panel`}
          >
            <View accessibilityLabel={copy.label} style={styles.homeServiceIcon} testID={`${serviceTestID}-icon`}>
              <SourceIconAura />
              <CustomerV21AssetVisual
                image={customerV21BookingServiceAssets[service]}
                reduceMotion={reduceMotion}
                size={50}
              />
            </View>
            <View
              pointerEvents="none"
              style={[
                styles.homeServiceConnector,
                { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' },
              ]}
              testID={`${serviceTestID}-connector`}
            />
            <View
              pointerEvents="none"
              style={[
                styles.homeServiceConnectorDot,
                { backgroundColor: tokens.primary, borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)' },
              ]}
              testID={`${serviceTestID}-connector-dot`}
            />
          </View>
          <View style={styles.homeServiceCopy} testID={`${serviceTestID}-copy`}>
            <View style={styles.homeServiceHeading} testID={`${serviceTestID}-heading`}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={2}
                style={[styles.serviceTitle, styles.homeServiceTitle, { color: tokens.text }]}
                testID={`${serviceTestID}-title`}
              >
                {copy.label}
              </Text>
            </View>
            <View style={styles.homeServiceDetailRail} testID={`${serviceTestID}-detail-rail`}>
              {copy.details.map((detail, index) => (
                <View key={detail} style={styles.homeServiceDetailRow} testID={`${serviceTestID}-detail-${index}`}>
                  <Svg height={14} viewBox="0 0 14 14" width={14}>
                    <Path
                      d={index === 0
                        ? 'M3.2 1.8h4.6l3 3v7.4H3.2V1.8Zm4.6 0v3h3M5 7h4M5 9.3h3.2'
                        : 'm3.1 7.1 2.4 2.4 5.2-5.1'}
                      fill="none"
                      stroke={tokens.primary}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={index === 0 ? 1.2 : 1.7}
                    />
                  </Svg>
                  <Text numberOfLines={1} style={[styles.homeServiceDetailLabel, { color: tokens.muted }]}>{detail}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : (
        <>
          <AssetTile image={customerV21BookingServiceAssets[service]} label={copy.label} size={58} style={styles.serviceIcon} />
          <Text numberOfLines={2} style={[styles.serviceTitle, { color: tokens.text }]}>{copy.label}</Text>
          <Text numberOfLines={2} style={[styles.serviceNote, { color: tokens.muted }]}>{copy.note}</Text>
        </>
      )}
    </Pressable>
  )
}

export function InactiveAgenticGate({ testID }: { testID: string }) {
  return <View collapsable={false} style={styles.inactiveAgenticGate} testID={testID} />
}

export function V21Screen({
  children,
  frameStyle,
  frameTestID,
  screenId,
  testID,
}: {
  children: ReactNode
  frameStyle?: StyleProp<ViewStyle>
  frameTestID?: string
  screenId: CustomerV21ScreenId
  testID: string
}) {
  const { mode, reduceTransparency, tokens } = useCustomerV21SurfaceTheme()
  const onDockScroll = useDockScrollHandler()
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.canvas }]} testID={testID}>
      <CustomerThemeSystemBar mode={mode} />
      <CustomerScreenCanvasAura mode={mode} reduceTransparency={reduceTransparency} screenId={screenId} />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        testID="customer-v21-scroll"
      >
        <View style={[styles.frame, frameStyle]} testID={frameTestID}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function TopBackChevron({ color }: { color: string }) {
  return (
    <Svg height={18} style={styles.topControlIcon} viewBox="0 0 24 24" width={18}>
      <Path d="M15 5L8 12L15 19" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} />
    </Svg>
  )
}

export function V21Card({
  children,
  glass = false,
  style,
  testID,
}: {
  children: ReactNode
  glass?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { mode, tokens } = useCustomerV21SurfaceTheme()
  const cardStyle = [
    styles.card,
    {
      backgroundColor: tokens.raised,
      borderColor: tokens.border,
    },
    glass ? null : tokens.mode === 'dark' ? styles.cardShadowDark : styles.cardShadowLight,
    style,
  ]

  if (glass) {
    return (
      <GlassSurface
        backgroundColor={tokens.glass}
        borderColor={tokens.glassBorder}
        material="liquid"
        mode={mode}
        style={cardStyle}
        testID={testID}
        variant="hero"
      >
        {children}
      </GlassSurface>
    )
  }

  return <View style={cardStyle} testID={testID}>{children}</View>
}

export function V21TopBar({
  actionAccessibilityLabel,
  actionLabel,
  actionTestID,
  avatarImage,
  avatarText,
  containerStyle,
  leading,
  onAction,
  onBack,
  showAvatar = true,
  subtitle,
  testID,
  title,
  titleContainerStyle,
  titleStyle,
}: {
  actionAccessibilityLabel?: string
  actionLabel?: string
  actionTestID?: string
  avatarImage?: ImageSourcePropType
  avatarText?: string
  containerStyle?: StyleProp<ViewStyle>
  leading?: ReactNode
  onAction?: () => void
  onBack?: () => void
  showAvatar?: boolean
  subtitle: string
  testID?: string
  title: string
  titleContainerStyle?: StyleProp<ViewStyle>
  titleStyle?: StyleProp<TextStyle>
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  const shouldShowAvatar = showAvatar && !onBack
  return (
    <View style={[styles.topBar, containerStyle]} testID={testID}>
      {leading ? (
        leading
      ) : onBack ? (
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={[styles.topControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <TopBackChevron color={tokens.primary} />
        </Pressable>
      ) : shouldShowAvatar ? (
        <View style={styles.topAvatarWrap} testID="customer-v21-top-avatar">
          {avatarImage ? (
            <Image contentFit="contain" source={avatarImage} style={styles.topAvatarImage} />
          ) : (
            <Text style={styles.topAvatarText}>{avatarText ?? 'NS'}</Text>
          )}
          <View style={styles.topAvatarDot} />
        </View>
      ) : null}
      <View style={[styles.flex, styles.topCopy, titleContainerStyle]}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          numberOfLines={1}
          style={[styles.topTitle, { color: tokens.text }, titleStyle]}
          testID="customer-v21-top-title"
        >
          {title}
        </Text>
        {subtitle ? <Text numberOfLines={2} style={[styles.topSubtitle, { color: tokens.muted }]} testID="customer-v21-top-subtitle">{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable accessibilityLabel={actionAccessibilityLabel ?? actionLabel} accessibilityRole="button" onPress={onAction} style={[styles.topControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={actionTestID}>
          <Text style={[styles.topActionText, { color: tokens.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function EmptyState({
  action,
  assetSize = 64,
  assetTile: AssetTile,
  bareAsset = false,
  body,
  formulaMintAura = false,
  image,
  mintAura = false,
  testID,
  title,
}: {
  action?: ReactNode
  assetSize?: number
  assetTile: CustomerV21AssetTile
  bareAsset?: boolean
  body: string
  formulaMintAura?: boolean
  image: CustomerV21Visual
  mintAura?: boolean
  testID?: string
  title: string
}) {
  const { reduceTransparency, tokens } = useCustomerV21SurfaceTheme()
  const formulaMintAuraScope = `EmptyState${(testID ?? title).replace(/[^A-Za-z0-9]/g, '') || 'Card'}`
  const standardContent = (
    <>
      <AssetTile bare={bareAsset} image={image} label={title} size={assetSize} testID={testID ? `${testID}-asset` : undefined} />
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>{body}</Text>
      {action}
    </>
  )

  if (mintAura) {
    return (
      <V21Card
        style={[
          styles.emptyState,
          styles.homeEmptyState,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'transparent',
            borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(255,255,255,0.91)',
          },
          tokens.mode === 'dark' ? styles.homeEmptyStateShadowDark : styles.homeEmptyStateShadowLight,
        ]}
        testID={testID}
      >
        <SourceCardSkin testID="customer-v21-home-empty-card-skin" />
        <HomeEmptySourceAura reduceTransparency={reduceTransparency} />
        <View style={styles.emptyStateContent}>
          <AssetTile bare={bareAsset} image={image} label={title} size={80} sourceAura={!bareAsset} />
          <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>{body}</Text>
          {action}
        </View>
      </V21Card>
    )
  }

  return (
    <V21Card style={[styles.emptyState, formulaMintAura ? styles.emptyStateFormulaMintAuraCard : null]} testID={testID}>
      {formulaMintAura ? (
        <View pointerEvents="none" style={styles.emptyStateFormulaMintAura} testID={`${testID}-formula-mint-aura`}>
          <CaseWideMintAura intensity="strong" scope={`${formulaMintAuraScope}Wide`} testID={`${testID}-wide-mint-aura`} />
          <ZipMintAura scope={`${formulaMintAuraScope}Fine`} testID={`${testID}-mint-aura`} />
        </View>
      ) : null}
      {formulaMintAura ? <View style={styles.emptyStateFormulaMintAuraContent}>{standardContent}</View> : standardContent}
    </V21Card>
  )
}

export function ProgressRail({
  activeStep = 1,
  style,
  testID,
  tokens,
  total = 4,
}: {
  activeStep?: number
  style?: StyleProp<ViewStyle>
  testID?: string
  tokens: CustomerThemeTokens
  total?: number
}) {
  const language = useAppLanguage()
  return (
    <View
      style={[styles.progressRail, style]}
      accessibilityLabel={language === 'vi' ? `Bước ${activeStep} trên ${total}` : `Step ${activeStep} of ${total}`}
      testID={testID}
    >
      {Array.from({ length: total }).map((_, index) => {
        const step = index + 1
        const done = step < activeStep
        const active = step === activeStep
        return (
          <Fragment key={step}>
            {index > 0 ? (
              <View
                style={[styles.progressLine, { backgroundColor: step <= activeStep ? tokens.primary : tokens.border }]}
                testID={testID ? `${testID}-line-${index}` : undefined}
              />
            ) : null}
            <View
              style={[
                styles.progressNode,
                active ? styles.progressNodeActive : null,
                {
                  backgroundColor: done || active ? tokens.primary : tokens.ghost,
                  borderColor: done || active ? tokens.primary : tokens.border,
                },
              ]}
              testID={testID ? `${testID}-node-${step}` : undefined}
            >
              <Text style={[styles.progressNodeText, { color: done || active ? tokens.primaryText : tokens.muted }]}>{step}</Text>
            </View>
          </Fragment>
        )
      })}
    </View>
  )
}
