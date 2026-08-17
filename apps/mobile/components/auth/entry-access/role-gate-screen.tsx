import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import { useEntryAccessibility } from './components/materials'
import { entryTheme } from './theme'
import type { EntryAccessCopy } from './copy'
import type { RoleGateGreeting } from './role-gate-greeting'
import { RoleSelectionCards } from './role-selection-cards'
import type { EntryRole } from './types'

const ROLE_GATE_QUOTE_LINE_HEIGHT = 26
const ROLE_GATE_MASCOT_SIZE = 34
const ROLE_GATE_PUNCTUATION_GAP = entryTheme.spacing.sm

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
  const finalBangIndex = headline.lastIndexOf('!')
  const prefix = finalBangIndex === -1 ? headline : headline.slice(0, finalBangIndex)
  const finalBang = finalBangIndex === -1 ? '' : headline.slice(finalBangIndex)

  return (
    <View accessibilityLabel={headline} style={styles.greetingLine} testID="auth-role-gate-greeting">
      <Text style={[styles.h1, styles.gateGreetingTitle, { marginTop: 0 }]} testID="auth-role-gate-greeting-text">{prefix}</Text>
      {finalBang ? (
        <View style={styles.greetingPunctuation} testID="auth-role-gate-greeting-punctuation">
          <Text style={[styles.h1, styles.gateGreetingTitle, styles.greetingBang]} testID="auth-role-gate-greeting-bang">{finalBang}</Text>
          <View pointerEvents="none" style={styles.greetingKael} testID="auth-role-gate-kael-slot">
            <KaelCoreV9 size={ROLE_GATE_MASCOT_SIZE} testID="auth-role-gate-kael-mascot" />
          </View>
        </View>
      ) : null}
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
  greetingBang: { position: 'relative', zIndex: 1 },
  greetingKael: { marginLeft: ROLE_GATE_PUNCTUATION_GAP, position: 'relative', zIndex: 0 },
  greetingLine: { alignItems: 'flex-end', alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center', minHeight: ROLE_GATE_QUOTE_LINE_HEIGHT, overflow: 'visible' },
  greetingPunctuation: { alignItems: 'center', flexDirection: 'row', height: ROLE_GATE_QUOTE_LINE_HEIGHT, marginLeft: 1, overflow: 'visible', position: 'relative' },
  h1: { ...entryTheme.typography.h1, color: entryTheme.color.text.strong },
  safe: { flex: 1 },
  screen: { flex: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX, paddingTop: 8 },
})
