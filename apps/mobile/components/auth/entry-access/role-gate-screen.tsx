import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEntryAccessibility } from './components/materials'
import { entryTheme } from './theme'
import type { EntryAccessCopy } from './copy'
import type { RoleGateGreeting } from './role-gate-greeting'
import { RoleSelectionCards } from './role-selection-cards'
import type { EntryRole } from './types'

const ROLE_GATE_QUOTE_LINE_HEIGHT = 26
const ROLE_GATE_LOGO_SIZE = 44
const ROLE_GATE_LOGO = require('@/assets/nestscout-aurora-nest-role-gate-transparent.png')

export function RoleGateScreen({
  copy,
  greeting,
  onContinue,
  onRoleChange,
  role,
}: {
  copy: EntryAccessCopy['roleGate']
  greeting: RoleGateGreeting
  onContinue: () => void
  onRoleChange: (role: EntryRole) => void
  role: EntryRole
}) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.screen} testID="auth-role-gate-content">
        <View style={styles.gateHead}>
          <RoleGateGreetingHeadline headline={greeting.headline} />
        </View>
        <DecisionField copy={copy} onContinue={onContinue} onRoleChange={onRoleChange} role={role} />
      </View>
    </SafeAreaView>
  )
}

function RoleGateGreetingHeadline({ headline }: { headline: string }) {
  return (
    <View accessibilityLabel={headline} style={styles.greetingLine} testID="auth-role-gate-greeting">
      <View pointerEvents="none" style={styles.greetingLogoSlot} testID="auth-role-gate-logo-slot">
        <Image
          accessible={false}
          contentFit="cover"
          source={ROLE_GATE_LOGO}
          style={styles.greetingLogo}
          testID="auth-role-gate-logo"
        />
      </View>
      <Text style={[styles.h1, styles.gateGreetingTitle, { marginTop: 0 }]} testID="auth-role-gate-greeting-text">{headline}</Text>
    </View>
  )
}

function DecisionField({ copy, onContinue, onRoleChange, role }: {
  copy: EntryAccessCopy['roleGate']
  onContinue: () => void
  onRoleChange: (role: EntryRole) => void
  role: EntryRole
}) {
  const { reduceMotion, reduceTransparency } = useEntryAccessibility()
  const [hasSelectedRole, setHasSelectedRole] = useState(false)

  const handleRolePress = (nextRole: EntryRole) => {
    if (hasSelectedRole && role === nextRole) {
      onContinue()
      return
    }

    setHasSelectedRole(true)
    onRoleChange(nextRole)
  }

  return (
    <View style={styles.decisionField} testID="auth-role-gate-decision-field">
      <RoleSelectionCards
        accessibilityHint={copy.selectionHint}
        chooseRoleLabel={copy.chooseRole}
        customer={copy.customer}
        onSelect={handleRolePress}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        selectedRole={hasSelectedRole ? role : null}
        customerTestID="auth-entry-role-customer"
        worker={copy.worker}
        workerTestID="auth-entry-role-worker"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  decisionField: { flex: 1, marginTop: 28, position: 'relative', width: '100%' },
  gateGreetingTitle: { ...entryTheme.typography.title3, lineHeight: ROLE_GATE_QUOTE_LINE_HEIGHT },
  gateHead: { paddingHorizontal: 4, paddingTop: 8 },
  greetingLogo: { height: ROLE_GATE_LOGO_SIZE, width: ROLE_GATE_LOGO_SIZE },
  greetingLogoSlot: { height: ROLE_GATE_QUOTE_LINE_HEIGHT, justifyContent: 'center', marginRight: 4, overflow: 'visible', width: ROLE_GATE_LOGO_SIZE },
  greetingLine: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center', minHeight: ROLE_GATE_QUOTE_LINE_HEIGHT, overflow: 'visible' },
  h1: { ...entryTheme.typography.h1, color: entryTheme.color.text.strong },
  safe: { flex: 1 },
  screen: { flex: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX, paddingTop: 8 },
})
