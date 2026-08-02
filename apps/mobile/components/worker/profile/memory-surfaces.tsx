import type { ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon, type WorkerV5IntegratedIconTone } from '../ui/integrated-icon-surfaces'
import type { WorkerV5MemoryPreferenceUiId } from './memory'
import { styles } from './memory-styles'

type WorkerV5MemoryAura = ComponentType<{ testID: string }>
type WorkerV5MemoryIcons = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5MemorySwitchItem = {
  enabled: boolean
  icon: WorkerV5IconName
  id: WorkerV5MemoryPreferenceUiId
  label: string
  value: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function memoryIconTone(icon: WorkerV5IconName): WorkerV5IntegratedIconTone {
  switch (icon) {
    case 'map':
      return 'location'
    case 'clock':
      return 'signal'
    case 'tools':
      return 'service'
    case 'jobs':
      return 'action'
    case 'shield':
      return 'identity'
    default:
      return 'service'
  }
}

export function WorkerV5MemoryHero({
  heroAura: HeroAura,
  language,
  reduceTransparency,
  shieldIcon,
}: {
  heroAura: WorkerV5MemoryAura
  language: AppLanguage
  reduceTransparency: boolean
  shieldIcon: ImageSourcePropType
}) {
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-memory-hero">
      {!reduceTransparency ? <HeroAura testID="worker-v5-memory-mint-aura" /> : null}
      <WorkerV5IntegratedIcon
        bleed={16}
        image={shieldIcon}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-memory-hero-icon"
        tone="identity"
        variant="heroPanel"
      />
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-memory-title">{textByLanguage(language, 'Kael nhớ theo quyền bạn cho.', 'Kael remembers only what you allow.')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Không tự nhận việc hoặc chia sẻ ngoài công việc.', 'No accepting work on its own or sharing outside work.')}</Text>
      </View>
    </View>
  )
}

export function WorkerV5MemorySwitchList({
  auraTestID,
  iconVisualBoost,
  icons,
  items,
  listAura: ListAura,
  onChange,
  reduceMotion,
  reduceTransparency,
  savingIds,
  testID,
}: {
  auraTestID: string
  iconVisualBoost: ReadonlySet<WorkerV5IconName>
  icons: WorkerV5MemoryIcons
  items: readonly WorkerV5MemorySwitchItem[]
  listAura: WorkerV5MemoryAura
  onChange: (id: WorkerV5MemoryPreferenceUiId, enabled: boolean, previousEnabled: boolean) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  savingIds: Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>
  testID: string
}) {
  return (
    <View style={[styles.memorySwitchList, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency ? <ListAura testID={auraTestID} /> : null}
      {items.map((item, index) => {
        const saving = Boolean(savingIds[item.id])
        return (
          <Pressable
            key={item.id}
            accessibilityLabel={`${item.label}. ${item.value}`}
            accessibilityRole="switch"
            accessibilityState={{ checked: item.enabled, busy: saving }}
            disabled={saving}
            onPress={() => onChange(item.id, !item.enabled, item.enabled)}
            style={({ pressed }) => [
              styles.memorySwitchRow,
              index === items.length - 1 ? styles.memorySwitchRowLast : null,
              pressed && !reduceMotion ? styles.pressed : null,
            ]}
            testID={`${testID}-row-${index}`}
          >
            <WorkerV5IntegratedIcon
              bleed={12}
              image={icons[item.icon]}
              imageScale={iconVisualBoost.has(item.icon) ? 1.18 : 1}
              reduceTransparency={reduceTransparency}
              testID={`${testID}-icon-shell-${index}`}
              tone={memoryIconTone(item.icon)}
              variant="panel"
            />
            <View style={styles.memorySwitchCopy}>
              <Text style={styles.memorySwitchTitle} numberOfLines={2} testID={`${testID}-title-${index}`}>{item.label}</Text>
              <Text style={styles.memorySwitchValue} numberOfLines={2} testID={`${testID}-value-${index}`}>{item.value}</Text>
            </View>
            <View
              style={[styles.toggleTrack, item.enabled ? styles.toggleTrackOn : null]}
              testID={`${testID}-track-${index}`}
            >
              <View style={[styles.toggleKnob, item.enabled ? styles.toggleKnobOn : null]} />
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
