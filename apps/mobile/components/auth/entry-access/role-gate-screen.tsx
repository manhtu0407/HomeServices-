import { View } from 'react-native'
import { useAppLanguage } from '@/lib/app-language'
import { NestScoutLoginGate } from './nestscout-login-gate/nestscout-login-gate'
import type { EntryAccessCopy } from './copy'
import type { EntryRole } from './types'

export function RoleGateScreen({
  copy,
  brandAccessibilityLabel,
  onContinue,
  onRoleChange,
}: {
  copy: EntryAccessCopy['roleGate']
  brandAccessibilityLabel: string
  onContinue: () => void
  onRoleChange: (role: EntryRole) => void
}) {
  const language = useAppLanguage()
  const textMode = language === 'vi' ? 'reference' : 'native'

  const handleRolePress = (role: EntryRole) => {
    onRoleChange(role)
    onContinue()
  }

  return (
    <View style={styles.screen} testID="auth-role-gate-decision-field">
      <View
        accessibilityLabel={copy.chooseRole}
        accessibilityRole="radiogroup"
        style={styles.options}
        testID="auth-entry-role-options"
      >
        <NestScoutLoginGate
          accessibilityHint={copy.selectionHint}
          brandAccessibilityLabel={brandAccessibilityLabel}
          copy={{
            heading: copy.heading,
            intro: copy.intro,
            'customer-title': copy.customer.title,
            'customer-description': copy.customer.description,
            'worker-title': copy.worker.title,
            'worker-description': copy.worker.description,
            'footer-caption': copy.footerCaption,
          }}
          mode="app"
          onRolePress={handleRolePress}
          textMode={textMode}
        />
      </View>
    </View>
  )
}

const styles = {
  options: { flex: 1 },
  screen: { flex: 1 },
} as const
