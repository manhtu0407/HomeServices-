import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { typography } from '@/design/theme'

import { useCustomerV21SurfaceTheme, V21Card, V21Screen, V21TopBar } from '../ui/shared-surfaces'

const STAR_PATH = 'M12 2.9 14.83 8.64l6.34.92-4.59 4.48 1.08 6.32L12 17.38l-5.66 2.98 1.08-6.32-4.59-4.48 6.34-.92L12 2.9Z'

export function CustomerSavedWorkerStarPrototype() {
  const router = useRouter()
  const { tokens } = useCustomerV21SurfaceTheme()

  return (
    <V21Screen
      frameStyle={styles.frame}
      screenId="2.6-case-overview"
      testID="customer-saved-worker-star-prototype"
    >
      <V21TopBar
        onBack={() => router.back()}
        showAvatar={false}
        subtitle=""
        testID="customer-saved-worker-star-prototype-top-bar"
        title="Hoạt động"
      />

      <V21Card
        style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-saved-worker-star-prototype-card"
      >
        <View style={styles.content}>
          <View
            accessible={false}
            style={[styles.iconTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-saved-worker-star-prototype-star-tile"
          >
            <ClassicStarMark color={tokens.primary} outline={tokens.text} />
          </View>

          <View style={styles.copy}>
            <Text style={[styles.title, { color: tokens.text }]} testID="customer-saved-worker-star-prototype-title">
              Thợ đã lưu
            </Text>
            <Text style={[styles.body, { color: tokens.muted }]} testID="customer-saved-worker-star-prototype-body">
              Kael sẽ ưu tiên họ trong lần tìm tiếp theo.
            </Text>
          </View>
        </View>
      </V21Card>
    </V21Screen>
  )
}

function ClassicStarMark({ color, outline }: { color: string; outline: string }) {
  return (
    <Svg
      accessible={false}
      fill="none"
      height={19}
      testID="customer-saved-worker-star-prototype-star"
      viewBox="0 0 24 24"
      width={19}
    >
      <Path
        d={STAR_PATH}
        fill={color}
        stroke={outline}
        strokeLinejoin="round"
        strokeWidth={0.8}
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  body: {
    ...typography.subheadline,
    lineHeight: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  frame: {
    gap: 0,
  },
  iconTile: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  title: {
    ...typography.headline,
    fontWeight: '700',
  },
})
