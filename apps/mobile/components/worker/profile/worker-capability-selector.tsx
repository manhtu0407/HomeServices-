import { Text, View } from 'react-native'
import { WORKER_SERVICE_CAPABILITIES, type ServiceType } from '@nestscout/shared'

import { KaelChip } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { styles } from './registration-styles'

export function WorkerCapabilitySelector({ disabled, isDark, language, onChange, selected, services }: {
  disabled: boolean
  isDark: boolean
  language: AppLanguage
  onChange: (keys: string[]) => void
  selected: string[]
  services: ServiceType[]
}) {
  return <View style={styles.formGap} testID="worker-capability-selector">
    <Text style={[styles.note, isDark ? styles.darkCopy : null]}>
      {textByLanguage(language, 'Chọn kỹ năng bạn có thể thực hiện. Chọn dịch vụ không tự chọn kỹ năng.', 'Select the skills you can perform. Selecting a service does not select its skills.')}
    </Text>
    {services.map(service => <View key={service} style={styles.formGap}>
      <Text style={[styles.formLabel, isDark ? styles.darkTitle : null]}>{localizedServiceLabel(service, language)}</Text>
      <View style={styles.serviceWrap}>
        {Object.entries(WORKER_SERVICE_CAPABILITIES[service]).map(([key, labels]) => {
          const checked = selected.includes(key)
          const label = labels[language === 'vi' ? 0 : 1]
          return <KaelChip
            accessibilityLabel={label}
            accessibilityState={{ selected: checked, disabled }}
            disabled={disabled}
            key={key}
            label={label}
            onPress={() => {
              if (disabled) return
              onChange(checked ? selected.filter(value => value !== key) : [...selected, key])
            }}
            testID={`worker-capability-${key}`}
            variant={checked ? 'selected' : 'unselected'}
          />
        })}
      </View>
    </View>)}
  </View>
}
