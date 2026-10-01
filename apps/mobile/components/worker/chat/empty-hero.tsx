import { useEffect, useState } from 'react'
import { Text, View, type LayoutChangeEvent } from 'react-native'

import { KaelChatMascot } from '@/components/customer/kael-chat/kael-chat-mascot'
import type { AppLanguage } from '@/lib/app-language'

import {
  getWorkerKaelEmptyHeroCopy,
  millisecondsUntilNextVietnamTwoHourSlot,
  type WorkerKaelEmptyHeroMode,
} from './empty-hero-copy'
import { styles } from './empty-hero-styles'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'

const SLOT_TIMER_GRACE_MS = 40
const HERO_CENTER_TO_TOP_SHIFT_RATIO = 0.3 / 2

export function WorkerV5KaelEmptyHero({
  contextualCopy,
  language,
  mode,
  reduceMotion,
}: {
  contextualCopy?: string | null
  language: AppLanguage
  mode: WorkerKaelEmptyHeroMode
  reduceMotion: boolean
}) {
  const [now, setNow] = useState(() => new Date())
  const [heroHeight, setHeroHeight] = useState(0)
  const workerThemeMode = useWorkerThemeMode()
  const themeTokens = getWorkerThemeTokens(workerThemeMode)
  const copy = contextualCopy ? { text: contextualCopy } : getWorkerKaelEmptyHeroCopy(mode, 'en', now)

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(new Date())
    }, millisecondsUntilNextVietnamTwoHourSlot(now) + SLOT_TIMER_GRACE_MS)

    return () => clearTimeout(timer)
  }, [now])

  const handleHeroLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height
    setHeroHeight((current) => current === nextHeight ? current : nextHeight)
  }

  return (
    <View onLayout={handleHeroLayout} style={styles.hero} testID={`worker-v5-kael-empty-hero-${mode}`}>
      <View
        style={[styles.content, { transform: [{ translateY: -heroHeight * HERO_CENTER_TO_TOP_SHIFT_RATIO }] }]}
        testID="worker-v5-kael-empty-hero-content"
      >
        <View
          accessibilityLabel={language === 'vi' ? 'Mô hình Kael đang chờ bạn' : 'Kael is waiting for you'}
          accessibilityRole="image"
          accessible
          style={styles.modelStage}
        >
          <KaelChatMascot
            accessibilityLabel={language === 'vi' ? 'Mô hình Kael đang chờ bạn' : 'Kael is waiting for you'}
            motion={reduceMotion ? 'static' : 'live'}
            reduceMotion={reduceMotion}
            size={116}
            testID="worker-v5-kael-empty-hero-model"
          />
        </View>
        <Text
          maxFontSizeMultiplier={1.6}
          style={[styles.copy, { color: themeTokens.text }]}
          testID="worker-v5-kael-empty-hero-copy"
        >
          {copy.text}
        </Text>
      </View>
    </View>
  )
}
