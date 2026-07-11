import { Fragment, type ComponentType, type ReactNode } from 'react'
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import type { CustomerServiceId } from '@nestscout/shared'
import { GlassSurface } from '@/components/ui/glass-surface'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { KaelChip } from '@/components/ui/kael-primitives'
import { useAppLanguage } from '@/lib/app-language'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
  type CustomerThemeTokens,
} from '../customer-theme'
import { CustomerScreenCanvasAura, HomeEmptySourceAura, SourceCardSkin, SourceIconAura, SourceIconTileSkin, ZipMintAura } from './aura-surfaces'
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

type CustomerV21AssetTile = ComponentType<{
  image: CustomerV21Visual
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}>

export function AssetTile({
  image,
  label,
  size = 52,
  sourceAura = false,
  style,
  testID,
}: {
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
    <View accessibilityLabel={label} style={[styles.assetTile, { backgroundColor: tokens.ghost, borderColor: tokens.border }, style]} testID={testID}>
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
  return <Image resizeMode="contain" source={image} style={{ height: size, width: size }} />
}

export function SectionHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <View style={styles.sectionHeader}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: tokens.primary }]}>{eyebrow}</Text> : null}
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>{title}</Text>
    </View>
  )
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
  homeAura = false,
  onPress,
  selected,
  service,
}: {
  homeAura?: boolean
  onPress: () => void
  selected?: boolean
  service: CustomerServiceId
}) {
  const language = useAppLanguage()
  const { reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const copy = customerV21BookingServiceCopy[language][service]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceTile,
        homeAura ? styles.homeAuraServiceTile : null,
        homeAura ? (tokens.mode === 'dark' ? styles.homeAuraServiceTileShadowDark : styles.homeAuraServiceTileShadowLight) : null,
        {
          backgroundColor: homeAura ? 'transparent' : selected ? tokens.service : tokens.raised,
          borderColor: selected ? (homeAura ? 'rgba(64,215,193,0.46)' : tokens.primary) : homeAura ? 'rgba(255,255,255,0.91)' : tokens.border,
          transform: [{ scale: pressed && !reduceMotion ? 0.985 : 1 }],
        },
      ]}
      testID={`customer-v21-service-${service}`}
    >
      {homeAura ? <SourceCardSkin /> : null}
      <AssetTile image={customerV21BookingServiceAssets[service]} label={copy.label} size={homeAura ? 46 : 58} sourceAura={homeAura} style={styles.serviceIcon} />
      <Text numberOfLines={2} style={[styles.serviceTitle, homeAura ? styles.homeServiceTitle : null, { color: tokens.text }]}>{copy.label}</Text>
      <Text numberOfLines={2} style={[styles.serviceNote, homeAura ? styles.homeServiceNote : null, { color: tokens.muted }]}>{copy.note}</Text>
    </Pressable>
  )
}

export function InactiveAgenticGate({ testID }: { testID: string }) {
  return <View collapsable={false} style={styles.inactiveAgenticGate} testID={testID} />
}

export function V21Screen({
  children,
  screenId,
  testID,
}: {
  children: ReactNode
  screenId: CustomerV21ScreenId
  testID: string
}) {
  const { reduceTransparency, tokens } = useCustomerV21SurfaceTheme()
  const onDockScroll = useDockScrollHandler()
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.canvas }]} testID={testID}>
      <CustomerScreenCanvasAura reduceTransparency={reduceTransparency} screenId={screenId} />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        testID="customer-v21-scroll"
      >
        <View style={styles.frame}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export function TopBackChevron({ color }: { color: string }) {
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
    tokens.mode === 'dark' ? styles.cardShadowDark : styles.cardShadowLight,
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
  leading,
  onAction,
  onBack,
  showAvatar = true,
  subtitle,
  title,
  titleContainerStyle,
  titleStyle,
}: {
  actionAccessibilityLabel?: string
  actionLabel?: string
  actionTestID?: string
  avatarImage?: ImageSourcePropType
  avatarText?: string
  leading?: ReactNode
  onAction?: () => void
  onBack?: () => void
  showAvatar?: boolean
  subtitle: string
  title: string
  titleContainerStyle?: StyleProp<ViewStyle>
  titleStyle?: StyleProp<TextStyle>
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  const shouldShowAvatar = showAvatar && !onBack
  return (
    <View style={styles.topBar}>
      {leading ? (
        leading
      ) : onBack ? (
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={[styles.topControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <TopBackChevron color={tokens.primary} />
        </Pressable>
      ) : shouldShowAvatar ? (
        <View style={styles.topAvatarWrap} testID="customer-v21-top-avatar">
          {avatarImage ? (
            <Image resizeMode="contain" source={avatarImage} style={styles.topAvatarImage} />
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
  assetTile: AssetTile,
  body,
  image,
  mintAura = false,
  testID,
  title,
}: {
  action?: ReactNode
  assetTile: CustomerV21AssetTile
  body: string
  image: CustomerV21Visual
  mintAura?: boolean
  testID?: string
  title: string
}) {
  const { reduceTransparency, tokens } = useCustomerV21SurfaceTheme()

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
          <AssetTile image={image} label={title} size={54} sourceAura />
          <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>{body}</Text>
          {action}
        </View>
      </V21Card>
    )
  }

  return (
    <V21Card style={styles.emptyState} testID={testID}>
      <AssetTile image={image} label={title} size={64} />
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>{body}</Text>
      {action}
    </V21Card>
  )
}

export function EyebrowPill({
  animated = false,
  label,
  preserveCase = false,
  style,
  testID,
  tokens,
}: {
  animated?: boolean
  label: string
  preserveCase?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  tokens: CustomerThemeTokens
}) {
  const content = (
    <View style={[styles.eyebrowPill, style, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID={testID}>
      <View style={[styles.eyebrowDot, { backgroundColor: tokens.primary }]} />
      <Text style={[styles.eyebrowPillText, preserveCase ? styles.eyebrowPillTextPreserve : null, { color: tokens.primary }]}>{label}</Text>
    </View>
  )

  if (!animated) return content

  return (
    <ReduceMotionAwareEntranceView distanceY={4} style={styles.eyebrowMotionWrap}>
      {content}
    </ReduceMotionAwareEntranceView>
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
  return (
    <View style={[styles.progressRail, style]} accessibilityLabel={`Step ${activeStep} of ${total}`} testID={testID}>
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

export function InfoNotice({
  assetTile: AssetTile,
  body,
  image,
  title,
  tokens,
}: {
  assetTile: CustomerV21AssetTile
  body: string
  image: CustomerV21Visual
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.infoNotice, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
      <AssetTile image={image} label={title} size={38} style={styles.infoNoticeIcon} />
      <View style={styles.flex}>
        <Text style={[styles.infoNoticeTitle, { color: tokens.text }]}>{title}</Text>
        <Text style={[styles.infoNoticeBody, { color: tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

export function MatchingHandoffChip({
  label,
  style,
  testID,
  tone = 'unselected',
}: {
  label: string
  style?: StyleProp<ViewStyle>
  testID?: string
  tone?: 'selected' | 'success' | 'unselected'
}) {
  const variant = tone === 'success' ? 'successStatus' : tone
  const auraScope = `Handoff${tone}${(testID ?? label).replace(/[^A-Za-z0-9]/g, '') || 'Chip'}`
  return (
    <KaelChip
      backgroundLayer={tone === 'selected' || tone === 'success' ? <ZipMintAura scope={auraScope} /> : null}
      label={label}
      style={[
        styles.matchingHandoffChip,
        tone === 'selected' ? styles.matchingHandoffChipSelected : null,
        tone === 'success' ? styles.matchingHandoffChipSuccess : null,
        style,
      ]}
      testID={testID}
      textStyle={[
        styles.matchingHandoffChipText,
        tone === 'selected' ? styles.matchingHandoffChipSelectedText : null,
        tone === 'success' ? styles.matchingHandoffChipSuccessText : null,
      ]}
      variant={variant}
    />
  )
}
