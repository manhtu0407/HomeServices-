import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import { textByLanguage } from '../ui/format'
import { WorkerEarningsPeriodSelectionLens } from './period-selection-lens'
import { workerEarningsPeriodLabel } from './period-label'
import { WORKER_EARNINGS_PERIODS, type WorkerEarningsPeriod } from './overview-model'
import { styles } from './salary-overview-styles'

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
      style={[styles.periodSelector, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={`${testIDPrefix}-period-tabs`}
    >
      <View
        onLayout={({ nativeEvent: { layout } }) => setSurfaceWidth(layout.width)}
        style={styles.periodSelectorRail}
      >
        <WorkerEarningsPeriodSelectionLens
          colors={{
            bloom: tokens.glassHighlight,
            border: tokens.borderStrong,
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
        {WORKER_EARNINGS_PERIODS.map((item) => {
          const active = item === period
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item}
              onPress={() => onPeriodChange(item)}
              style={({ pressed }) => [
                styles.periodButton,
                active && {
                  backgroundColor: reduceTransparency ? tokens.glassStrong : 'transparent',
                  borderColor: tokens.borderStrong,
                  borderWidth: reduceTransparency ? 1 : 0,
                },
                pressed && !reduceMotion ? styles.pressed : null,
              ]}
              testID={`${testIDPrefix}-period-${item}`}
            >
              <Text style={[styles.workerCustomerFontText, styles.periodLabel, { color: active ? tokens.primary : tokens.muted }, active && styles.periodLabelActive]}>
                {workerEarningsPeriodLabel(item, language)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
