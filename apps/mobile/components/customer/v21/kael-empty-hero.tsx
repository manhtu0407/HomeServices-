import { useEffect, useState } from 'react'
import { AppState, Text, View, type LayoutChangeEvent } from 'react-native'

import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import {
  getCustomerKaelEmptyHeroCopy,
  millisecondsUntilNextVietnamTwoHourSlot,
  type CustomerKaelEmptyHeroMode,
} from './kael-empty-hero-copy'
import { customerV21ChatStyles as styles } from './chat-styles'

const SLOT_TIMER_GRACE_MS = 40
const HERO_CENTER_TO_TOP_SHIFT_RATIO = 0.3 / 2

export function CustomerKaelEmptyHero({
  language,
  mode,
  reduceMotion,
  tokens,
}: {
  language: AppLanguage
  mode: CustomerKaelEmptyHeroMode
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const [now, setNow] = useState(() => new Date())
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active')
  const [heroHeight, setHeroHeight] = useState(0)
  const copy = getCustomerKaelEmptyHeroCopy(mode, language, now)

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(new Date())
    }, millisecondsUntilNextVietnamTwoHourSlot(now) + SLOT_TIMER_GRACE_MS)

    return () => clearTimeout(timer)
  }, [now])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active'
      setAppActive(active)
      if (active) setNow(new Date())
    })

    return () => subscription.remove()
  }, [])

  const handleHeroLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height
    setHeroHeight((current) => current === nextHeight ? current : nextHeight)
  }

  return (
    <View onLayout={handleHeroLayout} style={styles.chatEmptyHero} testID={`customer-v21-kael-empty-hero-${mode}`}>
      <View
        style={[styles.chatEmptyHeroContent, { transform: [{ translateY: -heroHeight * HERO_CENTER_TO_TOP_SHIFT_RATIO }] }]}
        testID="customer-v21-kael-empty-hero-content"
      >
        <View
          accessibilityLabel={language === 'vi' ? 'Mô hình Kael đang chờ bạn' : 'Kael is waiting for you'}
          accessibilityRole="image"
          accessible
          style={styles.chatEmptyHeroModelStage}
        >
          <KaelCoreV9
            motionClip={reduceMotion || !appActive ? undefined : 'autoplay-loop'}
            reduceMotion={reduceMotion}
            size={116}
            testID="customer-v21-kael-empty-hero-model"
          />
        </View>
        <Text
          maxFontSizeMultiplier={1.6}
          style={[styles.chatEmptyHeroCopy, { color: tokens.text }]}
          testID="customer-v21-kael-empty-hero-copy"
        >
          {copy.text}
        </Text>
      </View>
    </View>
  )
}
