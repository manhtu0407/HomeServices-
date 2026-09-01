import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import { textByLanguage } from '../ui/format'
import { WorkerEarningsPeriodSelectionLens } from './period-selection-lens'
import { workerEarningsPeriodLabel } from './period-label'
import { WORKER_EARNINGS_PERIODS, type WorkerEarningsPeriod } from './overview-model'

export function WorkerEarningsPeriodSelector({
  language,
  onPeriodChange,
  period,
  reduceMotion,
  reduceTransparency,
  testIDPrefix = 'worker-v5-earnings',
}: {
  language: AppLanguage
  onPeriodChange: (period: WorkerEarningsPeriod) => void
  period: WorkerEarningsPeriod
  reduceMotion: boolean
  reduceTransparency: boolean
  testIDPrefix?: string
}) {
  const [surfaceWidth, setSurfaceWidth] = useState(0)
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const selectedIndex = Math.max(WORKER_EARNINGS_PERIODS.indexOf(period), 0)

  return (
    <View
      accessibilityLabel={textByLanguage(language, 'Khoảng thời gian thu nhập', 'Earnings period')}
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={`${testIDPrefix}-period-tabs`}
    >
      <View
        onLayout={({ nativeEvent: { layout } }) => setSurfaceWidth(layout.width)}
        style={styles.rail}
        testID={`${testIDPrefix}-period-rail`}
      >
        <WorkerEarningsPeriodSelectionLens
          colors={{
            bloom: tokens.glassHighlight,
            border: tokens.primary,
            fill: tokens.glassStrong,
            innerBorder: tokens.border,
            shadow: tokens.glassFloatShadow,
            sheen: tokens.glassHighlight,
            topLight: tokens.glassHighlight,
          }}
          itemCount={WORKER_EARNINGS_PERIODS.length}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          selectedIndex={selectedIndex}
          surfaceWidth={surfaceWidth}
          testID={`${testIDPrefix}-period-lens`}
        />
        {WORKER_EARNINGS_PERIODS.map((candidate) => {
          const selected = period === candidate
          return (
            <Pressable
              accessibilityLabel={workerEarningsPeriodLabel(candidate, language)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={candidate}
              onPress={() => onPeriodChange(candidate)}
              style={({ pressed }) => [
                styles.button,
                selected && reduceTransparency ? {
                  backgroundColor: tokens.glassStrong,
                  borderColor: tokens.primary,
                  borderWidth: 1,
                } : null,
                pressed && !reduceMotion ? styles.buttonPressed : null,
              ]}
              testID={`${testIDPrefix}-period-${candidate}`}
            >
              <View
                pointerEvents="none"
                style={styles.visual}
                testID={`${testIDPrefix}-period-${candidate}-visual`}
              >
                <Text
                  style={[
                    styles.label,
                    { color: selected ? tokens.primary : tokens.muted },
                    selected ? styles.labelSelected : null,
                  ]}
                >
                  {workerEarningsPeriodLabel(candidate, language)}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    overflow: 'hidden',
    padding: 2,
    position: 'relative',
    width: '100%',
  },
  rail: { flex: 1, flexDirection: 'row', minHeight: 44, position: 'relative' },
  button: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 21,
    borderWidth: 0,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    position: 'relative',
    zIndex: 2,
  },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.976 }] },
  visual: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: '100%' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
    lineHeight: 17,
  },
  labelSelected: { fontWeight: '700', transform: [{ translateY: -1 }] },
})
