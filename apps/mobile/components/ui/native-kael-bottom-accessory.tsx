import { useRef } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { KaelCoreV9 } from './kael-core-v9'
import type { KaelCoreV9Handle } from './kael-core-v9-contract'
import { useGlassAccessibility } from './accessibility-motion'
import { useAppLanguage } from '@/lib/app-language'

export function NativeKaelBottomAccessory({ route }: { route: string }) {
  const router = useRouter()
  const language = useAppLanguage()
  const { reduceMotion } = useGlassAccessibility()
  const kaelRef = useRef<KaelCoreV9Handle>(null)
  const placement = NativeTabs.BottomAccessory.usePlacement()
  const label = language === 'vi' ? 'Kael' : 'Kael'

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onFocus={() => kaelRef.current?.bow('focus')}
      onHoverIn={() => kaelRef.current?.bow('proximity')}
      onPress={() => router.replace(route as never)}
      onPressIn={() => kaelRef.current?.bow('pointer-press')}
      style={[styles.accessory, placement === 'inline' ? styles.inline : styles.regular]}
      testID="native-kael-bottom-accessory"
    >
      <KaelCoreV9 reduceMotion={reduceMotion} ref={kaelRef} testID="native-kael-core-v9" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  accessory: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inline: {
    height: 52,
    width: 52,
  },
  regular: {
    height: 68,
    marginBottom: 2,
    width: 68,
  },
})
