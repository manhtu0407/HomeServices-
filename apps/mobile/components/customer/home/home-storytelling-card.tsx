import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient, NativeSafeRadialGradient as RadialGradient } from '@/components/ui/svg-alpha-stop'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, ZipMintAura } from '../ui/aura-surfaces'

type HomeStorytellingCardProps = {
  language: AppLanguage
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type OnboardingStep = {
  label: string
}

type StorytellingCopy = {
  accessibilityLabel: string
  body: string
  steps: [OnboardingStep, OnboardingStep, OnboardingStep]
  title: string
}

const storytellingCopy = {
  vi: {
    accessibilityLabel: 'Bắt đầu dễ dàng. Chọn dịch vụ, mô tả và xác nhận. Bước 1: Chọn dịch vụ. Bước 2: Mô tả vấn đề. Bước 3: Bạn xác nhận.',
    body: 'Chọn dịch vụ, mô tả và xác nhận.',
    steps: [
      { label: 'Chọn dịch vụ' },
      { label: 'Mô tả vấn đề' },
      { label: 'Bạn xác nhận' },
    ],
    title: 'Bắt đầu dễ dàng',
  },
  en: {
    accessibilityLabel: 'Getting started is easy. Choose a service, describe the issue, and confirm. Step 1: Choose a service. Step 2: Describe the issue. Step 3: Confirm.',
    body: 'Choose a service, describe the issue, and confirm.',
    steps: [
      { label: 'Choose service' },
      { label: 'Describe issue' },
      { label: 'Confirm' },
    ],
    title: 'Getting started is easy',
  },
} satisfies Record<AppLanguage, StorytellingCopy>

export function HomeStorytellingCard({ language, reduceTransparency, tokens }: HomeStorytellingCardProps) {
  const { width } = useWindowDimensions()
  const compact = width < 720
  const copy = storytellingCopy[language]
  const dark = tokens.mode === 'dark'
  const colors = {
    accent: tokens.primary,
    frame: dark ? tokens.canvas : tokens.base,
    frameEnd: dark ? tokens.service : tokens.water,
    frameMiddle: dark ? tokens.base : tokens.service,
    frameStart: dark ? tokens.canvas : tokens.base,
    subtitle: tokens.muted,
    text: tokens.text,
  }
  const badgeSize = compact ? 32 : 40

  return (
    <View
      style={[
        styles.frame,
        compact ? styles.frameCompact : styles.frameWide,
        {
          backgroundColor: colors.frame,
          borderRadius: compact ? 28 : 44,
          boxShadow: tokens.glassFloatShadow,
        },
      ]}
      testID="customer-v21-home-hero"
    >
      <Svg
        height="100%"
        pointerEvents="none"
        preserveAspectRatio="none"
        style={styles.background}
        testID="customer-v21-home-onboarding-wash"
        viewBox="0 0 400 100"
        width="100%"
      >
        <Defs>
          <LinearGradient id="customer-home-onboarding-frame" x1="0" x2="400" y1="0" y2="100">
            <Stop offset="0" stopColor={colors.frameStart} />
            <Stop offset="0.54" stopColor={colors.frameMiddle} />
            <Stop offset="1" stopColor={colors.frameEnd} />
          </LinearGradient>
          <RadialGradient cx="0.78" cy="0.06" id="customer-home-onboarding-glow" r="0.74">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={reduceTransparency ? 0 : dark ? 0.12 : 0.14} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#customer-home-onboarding-frame)" height="100" width="400" />
        <Rect fill="url(#customer-home-onboarding-glow)" height="100" width="400" />
      </Svg>

      {reduceTransparency ? null : (
        <View
          pointerEvents="none"
          style={[styles.formulaMintAura, { opacity: dark ? 0.36 : 0.52 }]}
          testID="customer-v21-home-onboarding-formula-mint-aura"
        >
          <CaseWideMintAura scope="HomeStorytelling" />
          <ZipMintAura scope="HomeStorytellingFine" />
        </View>
      )}

      <View
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityRole="image"
        accessible
        style={[styles.content, compact ? styles.contentCompact : styles.contentWide]}
        testID="customer-v21-home-storytelling"
      >
        <View style={styles.copy} testID="customer-v21-home-onboarding-copy">
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            numberOfLines={compact ? 2 : 1}
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: compact ? 22 : 28,
                lineHeight: compact ? 28 : 34,
              },
            ]}
          >
            {copy.title}
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            numberOfLines={compact ? 2 : 1}
            style={[
              styles.subtitle,
              {
                color: colors.subtitle,
                fontSize: compact ? 12 : 16,
                lineHeight: compact ? 16 : 22,
                marginTop: compact ? 6 : 8,
              },
            ]}
          >
            {copy.body}
          </Text>
        </View>

        <View style={styles.steps} testID="customer-v21-home-onboarding-steps">
          <View
            pointerEvents="none"
            style={[styles.connectorTrack, { backgroundColor: colors.accent, top: badgeSize / 2 }]}
          />
          <View style={styles.stepsRow}>
            {copy.steps.map((step, index) => (
              <View key={step.label} style={styles.stepColumn}>
                <View
                  style={[
                    styles.stepBadge,
                    {
                      backgroundColor: tokens.raised,
                      borderColor: colors.accent,
                      height: badgeSize,
                      width: badgeSize,
                    },
                  ]}
                  testID={'customer-v21-home-onboarding-step-' + (index + 1)}
                >
                  <Text
                    style={[
                      styles.stepBadgeText,
                      {
                        color: colors.accent,
                        fontSize: compact ? 14 : 16,
                        lineHeight: compact ? 18 : 18,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  numberOfLines={2}
                  style={[
                    styles.stepLabel,
                    {
                      color: colors.text,
                      fontSize: compact ? 12 : 15,
                      lineHeight: compact ? 16 : 19,
                      marginTop: compact ? 10 : 12,
                    },
                  ]}
                  testID={'customer-v21-home-onboarding-label-' + (index + 1)}
                >
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFill,
  },
  connectorTrack: {
    borderRadius: 999,
    height: 2,
    left: '16.6666667%',
    position: 'absolute',
    right: '16.6666667%',
    zIndex: 0,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  contentCompact: {
    gap: 14,
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
  contentWide: {
    gap: 34,
    paddingHorizontal: 44,
    paddingVertical: 28,
  },
  copy: {
    flex: 0.42,
    justifyContent: 'center',
    minWidth: 0,
    zIndex: 1,
  },
  frame: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  frameCompact: {
    aspectRatio: 3.2,
    minHeight: 148,
  },
  frameWide: {
    aspectRatio: 4,
  },
  formulaMintAura: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  stepBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.25,
    justifyContent: 'center',
    zIndex: 1,
  },
  stepBadgeText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    includeFontPadding: false,
  },
  stepColumn: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  stepLabel: {
    fontWeight: '600',
    includeFontPadding: false,
    letterSpacing: -0.16,
    minWidth: 0,
    textAlign: 'center',
  },
  steps: {
    flex: 0.58,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  stepsRow: {
    flexDirection: 'row',
    minWidth: 0,
  },
  subtitle: {
    fontWeight: '400',
    includeFontPadding: false,
    letterSpacing: -0.2,
  },
  title: {
    fontWeight: '700',
    includeFontPadding: false,
    letterSpacing: -0.75,
  },
})
