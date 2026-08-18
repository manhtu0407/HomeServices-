import { Pressable, Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import type { WorkerV5MemoryPreferenceUiId } from './memory'
import { WorkerV5UtilityGlyph, type WorkerV5UtilityGlyphName } from './utility-glyphs'
import { styles } from './memory-styles'
import { useWorkerThemeMode } from '../worker-theme'

type WorkerV5MemorySwitchItem = {
  enabled: boolean
  icon: WorkerV5UtilityGlyphName
  id: WorkerV5MemoryPreferenceUiId
  label: string
  value: string
}

function Text({ style, ...props }: TextProps) {
  const isDark = useWorkerThemeMode() === 'dark'
  return <RNText {...props} style={[styles.workerCustomerFontText, style, isDark ? styles.darkText : null]} />
}

export function WorkerV5MemoryHero({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const isDark = useWorkerThemeMode() === 'dark'
  return (
    <View style={[styles.earningsHeroCard, isDark ? styles.earningsHeroCardDark : null, reduceTransparency ? (isDark ? styles.darkOpaqueCard : styles.opaqueCard) : null]} testID="worker-v5-memory-hero">
      <View style={[styles.memoryHeroIconFrame, isDark ? styles.memoryHeroIconFrameDark : null]}>
        <WorkerV5UtilityGlyph name="shield" testID="worker-v5-memory-hero-icon" />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-memory-title">{textByLanguage(language, 'Kael nhớ theo quyền bạn cho.', 'Kael remembers only what you allow.')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Không tự nhận việc hoặc chia sẻ ngoài công việc.', 'No accepting work on its own or sharing outside work.')}</Text>
      </View>
    </View>
  )
}

export function WorkerV5MemorySwitchList({
  items,
  onChange,
  reduceMotion,
  reduceTransparency,
  savingIds,
  testID,
}: {
  items: readonly WorkerV5MemorySwitchItem[]
  onChange: (id: WorkerV5MemoryPreferenceUiId, enabled: boolean, previousEnabled: boolean) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  savingIds: Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>
  testID: string
}) {
  const isDark = useWorkerThemeMode() === 'dark'
  return (
    <View style={[styles.memorySwitchList, isDark ? styles.memorySwitchListDark : null, reduceTransparency ? (isDark ? styles.darkOpaqueCard : styles.opaqueCard) : null]} testID={testID}>
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
              isDark ? styles.memorySwitchRowDark : null,
              index === items.length - 1 ? styles.memorySwitchRowLast : null,
              pressed && !reduceMotion ? styles.pressed : null,
            ]}
            testID={`${testID}-row-${index}`}
          >
            <View style={[styles.memorySwitchIconFrame, isDark ? styles.memorySwitchIconFrameDark : null]} testID={`${testID}-icon-shell-${index}`}>
              <WorkerV5UtilityGlyph name={item.icon} testID={`${testID}-icon-shell-${index}-image`} />
            </View>
            <View style={styles.memorySwitchCopy}>
              <Text style={styles.memorySwitchTitle} numberOfLines={2} testID={`${testID}-title-${index}`}>{item.label}</Text>
              <Text style={[styles.memorySwitchValue, isDark ? styles.memorySwitchValueDark : null]} numberOfLines={2} testID={`${testID}-value-${index}`}>{item.value}</Text>
            </View>
            <View
              style={[styles.toggleTrack, isDark ? styles.toggleTrackDark : null, item.enabled ? styles.toggleTrackOn : null]}
              testID={`${testID}-track-${index}`}
            >
              <View style={[styles.toggleKnob, isDark ? styles.toggleKnobDark : null, item.enabled ? styles.toggleKnobOn : null]} />
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
