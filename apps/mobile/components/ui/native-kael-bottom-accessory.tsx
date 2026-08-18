import { StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useGlassAccessibility } from './accessibility-motion'
import { KaelNavigationAccessory, type KaelNavigationRole } from './kael-navigation-accessory'
import { useAppLanguage } from '@/lib/app-language'

export function NativeKaelBottomAccessory({ route, visualRole }: { route: string; visualRole: KaelNavigationRole }) {
  const router = useRouter()
  const language = useAppLanguage()
  const { reduceMotion } = useGlassAccessibility()
  const placement = NativeTabs.BottomAccessory.usePlacement()
  const label = language === 'vi' ? 'Kael' : 'Kael'

  return (
    <KaelNavigationAccessory
      accessibilityLabel={label}
      onPress={() => router.replace(route as never)}
      reduceMotion={reduceMotion}
      style={[styles.accessory, placement === 'inline' ? styles.inline : styles.regular]}
      testID="native-kael-bottom-accessory"
      visualRole={visualRole}
    />
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
