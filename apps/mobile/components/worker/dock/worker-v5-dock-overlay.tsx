import type { ReactNode } from 'react'
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { color, shadow } from '@/design/theme'

import { WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { resolveWorkerV5Language, workerV5Routes } from './routing'
import type { WorkerDockActive, WorkerV5IconName, WorkerV5RouteParams } from './types'

const workerV5DockIcons: Record<Exclude<WorkerV5IconName, 'calendar' | 'camera' | 'chat' | 'clock' | 'document' | 'evidence' | 'map' | 'shield' | 'scope' | 'tools' | 'wallet'>, ImageSourcePropType> = {
  earnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  home: require('@/assets/worker-image-icons/nav-home.png') as ImageSourcePropType,
  jobs: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/nav-profile.png') as ImageSourcePropType,
}

const workerV5DockKaelHeadIcon = require('@/assets/kael-emotions/kael-emotion-focused.png') as ImageSourcePropType

const WORKER_V5_DOCK_ROUTE_ITEMS: ReadonlyArray<{
  icon: keyof typeof workerV5DockIcons
  id: Exclude<WorkerDockActive, 'kael'>
  label: Record<'en' | 'vi', string>
}> = [
  { icon: 'home', id: 'home', label: { en: 'Home', vi: 'Trang chủ' } },
  { icon: 'jobs', id: 'jobs', label: { en: 'Jobs', vi: 'Công việc' } },
  { icon: 'earnings', id: 'earnings', label: { en: 'Earnings', vi: 'Thu nhập' } },
  { icon: 'profile', id: 'profile', label: { en: 'Profile', vi: 'Hồ sơ' } },
]

const WORKER_V5_DOCK_KAEL_ITEM: {
  icon: ImageSourcePropType
  id: Extract<WorkerDockActive, 'kael'>
  label: Record<'en' | 'vi', string>
} = {
  icon: workerV5DockKaelHeadIcon,
  id: 'kael',
  label: { en: 'Kael', vi: 'Kael' },
}

export function WorkerDockLayoutProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function WorkerRebuildDockOverlay({ active }: { active: WorkerDockActive }) {
  const router = useRouter()
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const language = resolveWorkerV5Language(params)
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <View pointerEvents="box-none" style={styles.workerV5DockOverlay} testID="worker-v5-dock-overlay">
      <View style={styles.workerV5DockRow} testID="worker-v5-dock-row">
        <View
          style={[styles.workerV5DockPlane, reduceTransparency ? styles.workerV5DockPlaneOpaque : null]}
          testID="worker-v5-liquid-navigation"
        >
          {WORKER_V5_DOCK_ROUTE_ITEMS.map((item) => {
            const selected = item.id === active
            return (
              <Pressable
                accessibilityLabel={item.label[language]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={item.id}
                onPress={() => router.replace(workerV5Routes[item.id] as never)}
                style={({ pressed }) => [
                  styles.workerV5DockItem,
                  selected ? styles.workerV5DockItemActive : null,
                  pressed ? styles.workerV5DockItemPressed : null,
                ]}
                testID={`worker-v5-dock-${item.id}`}
              >
                {!reduceTransparency && selected ? <WorkerV5CustomerZipMintAura scope={`WorkerV5Dock${item.id}`} style={styles.workerV5DockItemAura} /> : null}
                <Image source={workerV5DockIcons[item.icon]} style={styles.workerV5DockIcon} />
                <Text numberOfLines={1} style={[styles.workerV5DockLabel, selected ? styles.workerV5DockLabelActive : null]}>
                  {item.label[language]}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Pressable
          accessibilityLabel={WORKER_V5_DOCK_KAEL_ITEM.label[language]}
          accessibilityRole="button"
          accessibilityState={{ selected: active === WORKER_V5_DOCK_KAEL_ITEM.id }}
          onPress={() => router.replace(workerV5Routes[WORKER_V5_DOCK_KAEL_ITEM.id] as never)}
          style={({ pressed }) => [
            styles.workerV5DockKaelOrb,
            active === WORKER_V5_DOCK_KAEL_ITEM.id ? styles.workerV5DockKaelOrbActive : null,
            pressed ? styles.workerV5DockItemPressed : null,
          ]}
          testID="worker-v5-kael-accessory"
        >
          {!reduceTransparency ? <WorkerV5CustomerZipMintAura scope="WorkerV5DockKaelOrb" style={styles.workerV5DockKaelOrbAura} testID="worker-v5-kael-accessory-aura" /> : null}
          <View style={[styles.workerV5DockKaelOrbGlass, reduceTransparency ? styles.workerV5DockPlaneOpaque : null]}>
            <Image source={WORKER_V5_DOCK_KAEL_ITEM.icon} style={styles.workerV5DockKaelOrbIcon} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  workerV5DockIcon: {
    height: 24,
    width: 24,
  },
  workerV5DockItem: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 54,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 6,
    position: 'relative',
  },
  workerV5DockItemActive: {
    backgroundColor: 'rgba(224,251,244,0.88)',
    borderColor: 'rgba(127,226,215,0.8)',
  },
  workerV5DockItemAura: {
    bottom: -26,
    left: -26,
    opacity: 0.72,
    position: 'absolute',
    right: -26,
    top: -26,
  },
  workerV5DockItemPressed: {
    transform: [{ scale: 0.97 }],
  },
  workerV5DockKaelOrb: {
    flexShrink: 0,
    height: 70,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    width: 70,
  },
  workerV5DockKaelOrbActive: {
    transform: [{ scale: 1.015 }],
  },
  workerV5DockKaelOrbAura: {
    bottom: -18,
    left: -18,
    opacity: 0.82,
    position: 'absolute',
    right: -18,
    top: -18,
  },
  workerV5DockKaelOrbGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 35,
    borderWidth: 1,
    elevation: 7,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#05675D',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 29,
    width: 70,
  },
  workerV5DockKaelOrbIcon: {
    height: 48,
    width: 48,
  },
  workerV5DockLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: '100%',
    textAlign: 'center',
  },
  workerV5DockLabelActive: {
    color: color.brand.primaryDark,
  },
  workerV5DockOverlay: {
    alignItems: 'center',
    bottom: 16,
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    zIndex: 40,
  },
  workerV5DockPlane: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
    minHeight: 70,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...shadow.raised,
  },
  workerV5DockPlaneOpaque: {
    backgroundColor: color.mint.white,
  },
  workerV5DockRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    maxWidth: 430,
    width: '100%',
  },
})
