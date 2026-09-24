import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Alert,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextProps,
  type TextStyle,
} from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'

import { type AppleTypographyRole } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { STAGE_MAX_FONT_MULTIPLIER, stageTypography } from '../stage-ratio'
import { stageNineAssets } from './stage-nine-assets'
import { StageNineButtonSurface } from './stage-nine-button-surface'
import { stageNineCopy as C } from './stage-nine-copy'
import { stageNineTokens as T } from './stage-nine-tokens'

export type StageNineEmptyStageProps = {
  /** Extra scroll room under the stage, e.g. for a floating dock. */
  bottomClearance?: number
  footer?: ReactNode
  language: AppLanguage
  /** Opens the existing completion flow. It must never submit a record by itself. */
  onSubmit: () => void | Promise<void>
  reduceMotion?: boolean
  /** Top inset when the host lets the stage paint behind the status bar; 0 when the host already pads it. */
  topInset?: number
}

type StageTypeToken = { role: AppleTypographyRole; weight: '400' | '600' | '700' }

function StageText(props: TextProps) {
  return <Text maxFontSizeMultiplier={STAGE_MAX_FONT_MULTIPLIER} {...props} />
}

/**
 * Full-screen empty completion record. Only the scene is raster; every label and control is
 * native. Geometry scales uniformly from the 390-wide reference, and a short viewport scrolls
 * with its host instead of squeezing the illustration.
 */
export function StageNineEmptyStage({
  bottomClearance = 0,
  footer,
  language,
  onSubmit,
  reduceMotion = false,
  topInset = 0,
}: StageNineEmptyStageProps) {
  const window = useWindowDimensions()
  const [hostWidth, setHostWidth] = useState(() => Math.min(window.width, T.maxWidth))
  const [copyHeight, setCopyHeight] = useState(0)
  const [opening, setOpening] = useState(false)
  const mounted = useRef(true)
  const openingLock = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const s = hostWidth / T.reference.width
  const safeShift = Math.max(0, topInset - T.statusBarReserve * s)
  const y = (value: number) => value * s + safeShift
  const canvasHeight = T.reference.height * s
  const measuredBottom = y(T.layout.titleTop) + copyHeight + T.layout.bottomBreathingRoom * s
  const stageHeight = Math.max(canvasHeight + safeShift, measuredBottom) + bottomClearance
  const buttonRadius = T.layout.buttonRadius * s
  const buttonBorder = T.layout.buttonBorder * s
  const font = (token: StageTypeToken): TextStyle => ({ ...stageTypography(token.role, window.width), fontWeight: token.weight })

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.min(event.nativeEvent.layout.width, T.maxWidth)
    if (next > 0) setHostWidth((previous) => (Math.abs(previous - next) > 0.1 ? next : previous))
  }, [])

  const openCompletion = useCallback(async () => {
    if (openingLock.current) return
    openingLock.current = true
    setOpening(true)
    try {
      await onSubmit()
    } catch {
      if (mounted.current) Alert.alert(C.openFailedTitle[language], C.openFailedBody[language])
    } finally {
      openingLock.current = false
      if (mounted.current) setOpening(false)
    }
  }, [language, onSubmit])

  return (
    <View onLayout={onLayout} style={{ alignItems: 'center', backgroundColor: T.colors.page, width: '100%' }} testID="worker-v5-stage-nine-empty">
      <View style={{ height: stageHeight, overflow: 'hidden', width: hostWidth }} testID="worker-v5-stage-nine-empty-stage">
        {safeShift > 0 ? (
          <View style={{ backgroundColor: T.colors.background[0], height: safeShift, left: 0, position: 'absolute', right: 0, top: 0 }} />
        ) : null}
        <LinearGradient
          colors={T.colors.background}
          locations={T.colors.backgroundLocations}
          style={{ height: canvasHeight, left: 0, position: 'absolute', right: 0, top: safeShift }}
        />
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          contentFit="fill"
          source={stageNineAssets.scene}
          style={{ height: (hostWidth * T.illustration.height) / T.illustration.width, left: 0, position: 'absolute', top: safeShift, width: hostWidth }}
          testID="worker-v5-stage-nine-empty-scene"
          transition={0}
        />

        <StageText
          selectable
          style={{
            ...font(T.typography.quote),
            color: T.colors.quote,
            left: 30 * s,
            position: 'absolute',
            right: 30 * s,
            textAlign: 'center',
            top: y(T.layout.quoteTop),
          }}
          testID="worker-v5-stage-nine-empty-quote"
        >
          {C.quote[language]}
        </StageText>

        {/* Flow layout lets larger accessibility text push the action down instead of overlapping it. */}
        <View
          onLayout={(event) => setCopyHeight(event.nativeEvent.layout.height)}
          style={{ left: 0, position: 'absolute', right: 0, top: y(T.layout.titleTop) }}
          testID="worker-v5-stage-nine-empty-copy"
        >
          <StageText
            accessibilityRole="header"
            selectable
            style={{
              ...font(T.typography.title),
              color: T.colors.ink,
              marginHorizontal: 10 * s,
              textAlign: 'center',
            }}
            testID="worker-v5-stage-nine-empty-title"
          >
            {C.title[language]}
          </StageText>
          <StageText
            selectable
            style={{
              ...font(T.typography.body),
              color: T.colors.muted,
              marginHorizontal: 5 * s,
              marginTop: T.layout.descriptionGap * s,
              textAlign: 'center',
            }}
            testID="worker-v5-stage-nine-empty-body"
          >
            {C.body[language]}
          </StageText>

          <Pressable
            accessibilityHint={C.submitHint[language]}
            accessibilityLabel={C.submit[language]}
            accessibilityRole="button"
            accessibilityState={{ busy: opening, disabled: opening }}
            disabled={opening}
            onPress={() => {
              void openCompletion()
            }}
            style={({ pressed }) => ({
              borderRadius: buttonRadius,
              boxShadow: T.colors.buttonShadow,
              height: T.layout.buttonHeight * s,
              marginHorizontal: T.layout.buttonInset * s,
              marginTop: T.layout.buttonGap * s,
              opacity: pressed ? 0.97 : 1,
              transform: [{ scale: pressed && !reduceMotion ? 0.985 : 1 }],
            })}
            testID="worker-v5-stage-nine-empty-submit"
          >
            {/* Clipping lives on this inner layer so the outer shadow is never cut by overflow. */}
            <View
              pointerEvents="none"
              style={{ borderColor: T.colors.buttonBorder, borderRadius: buttonRadius, borderWidth: buttonBorder, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 }}
            >
              <StageNineButtonSurface
                height={(T.layout.buttonHeight - T.layout.buttonBorder * 2) * s}
                width={(T.reference.width - T.layout.buttonInset * 2 - T.layout.buttonBorder * 2) * s}
              />
              <View
                style={{ borderRadius: buttonRadius, borderTopColor: T.colors.buttonHighlight, borderTopWidth: 1.5 * s, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
              />
            </View>
            <View pointerEvents="none" style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
              <StageText
                style={{
                  ...font(T.typography.button),
                  color: T.colors.buttonLabel,
                }}
                testID="worker-v5-stage-nine-empty-submit-label"
              >
                {opening ? C.opening[language] : C.submit[language]}
              </StageText>
            </View>
          </Pressable>

          {footer ? <View style={{ marginHorizontal: T.layout.buttonInset * s, marginTop: 16 * s }}>{footer}</View> : null}
        </View>
      </View>
    </View>
  )
}
