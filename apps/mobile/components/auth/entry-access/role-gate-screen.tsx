import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AssetTile, GlassPanel, PrimaryButton, useEntryAccessibility } from './components/materials'
import { EntryIcon } from './components/icons'
import { entryTheme } from './theme'
import type { EntryAccessCopy } from './copy'
import type { RoleGateGreeting } from './role-gate-greeting'
import type { EntryRole } from './types'

const roleAssets = {
  customerHome: require('./assets/customer-home.png') as ImageSourcePropType,
  workerTools: require('./assets/worker-tools.png') as ImageSourcePropType,
}

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
          <Text style={[styles.h1, styles.gateGreetingTitle, { marginTop: 0 }]} testID="auth-role-gate-greeting">{greeting.headline}</Text>
          <Text style={[styles.lead, { marginTop: 7 }]} testID="auth-role-gate-greeting-lead">{greeting.lead}</Text>
        </View>
        <RoleGateGreetingRail signature={greeting.signature} />
        <View accessibilityLabel={copy.chooseRole} accessibilityRole="radiogroup" style={styles.roleList} testID="auth-entry-role-options">
          <RoleCard
            badge={copy.customer.badge}
            description={copy.customer.description}
            meta={copy.customer.meta}
            onPress={() => onRoleChange('customer')}
            selected={role === 'customer'}
            source={roleAssets.customerHome}
            testID="auth-entry-role-customer"
            title={copy.customer.title}
          />
          <RoleCard
            description={copy.worker.description}
            meta={copy.worker.meta}
            onPress={() => onRoleChange('worker')}
            selected={role === 'worker'}
            source={roleAssets.workerTools}
            testID="auth-entry-role-worker"
            title={copy.worker.title}
          />
        </View>
        <View style={styles.gateBottom}>
          <PrimaryButton label={role === 'customer' ? copy.continueCustomer : copy.continueWorker} onPress={onContinue} testID="auth-role-continue" />
          <Text style={[styles.caption, styles.gateFoot]}>{copy.footer}</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

function RoleGateGreetingRail({ signature }: { signature: string }) {
  const { reduceTransparency } = useEntryAccessibility()

  return (
    <View style={styles.signatureRailShell} testID="auth-role-gate-signature-shell">
      {!reduceTransparency ? <View pointerEvents="none" style={styles.signatureRailAura} testID="auth-role-gate-signature-aura" /> : null}
      <GlassPanel style={styles.signatureRail} testID="auth-role-gate-signature-rail">
        <View style={styles.sparkTile}><EntryIcon color={entryTheme.color.mint.mint700} name="spark" size={16} /></View>
        <Text style={styles.signatureText} testID="auth-role-gate-greeting-signature">{signature}</Text>
      </GlassPanel>
    </View>
  )
}

function RoleCard({ badge, description, meta, onPress, selected, source, testID, title }: {
  badge?: string
  description: string
  meta: string
  onPress: () => void
  selected: boolean
  source: ImageSourcePropType
  testID: string
  title: string
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }: { pressed: boolean }) => [styles.roleCard, selected && styles.roleCardSelected, pressed && styles.pressed]} testID={testID}>
      <AssetTile source={source} />
      <View style={styles.roleCopy}>
        <View style={styles.roleTitleRow}>
          <Text style={styles.h3}>{title}</Text>
          {badge ? <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{badge}</Text></View> : null}
        </View>
        <Text style={styles.roleDescription}>{description}</Text>
        <Text style={styles.roleMeta}>{meta}</Text>
      </View>
      <View style={styles.roleArrow}><EntryIcon color={entryTheme.color.mint.mint700} name="arrow-right" size={13} /></View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  caption: { ...entryTheme.typography.caption, color: entryTheme.color.text.muted },
  gateBottom: { marginTop: 'auto', paddingTop: 12 },
  gateFoot: { marginTop: 10, textAlign: 'center' },
  gateGreetingTitle: { fontSize: 29, lineHeight: 35 },
  gateHead: { paddingHorizontal: 4, paddingTop: 8 },
  h1: { ...entryTheme.typography.h1, color: entryTheme.color.text.strong },
  h3: { ...entryTheme.typography.h3, color: entryTheme.color.text.strong },
  lead: { ...entryTheme.typography.body, color: entryTheme.color.text.secondary },
  pressed: { opacity: 0.78 },
  roleArrow: { alignItems: 'center', backgroundColor: 'rgba(230,251,243,0.76)', borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  roleBadge: { backgroundColor: entryTheme.color.mint.mint50, borderColor: entryTheme.color.surface.strokeStrong, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  roleBadgeText: { color: entryTheme.color.mint.mint700, fontSize: 9, fontWeight: '700', letterSpacing: 0, textTransform: 'uppercase' },
  roleCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.87)', borderColor: entryTheme.color.surface.stroke, borderRadius: entryTheme.radius.card, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 144, paddingHorizontal: 15, paddingVertical: 16, ...entryTheme.shadow.soft },
  roleCardSelected: { backgroundColor: 'rgba(241,251,248,0.96)', borderColor: 'rgba(36,179,161,0.54)', boxShadow: '0px 16px 17px rgba(8,135,121,0.13)' },
  roleCopy: { flex: 1 },
  roleDescription: { color: entryTheme.color.text.secondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  roleList: { gap: 12 },
  roleMeta: { color: entryTheme.color.text.muted, fontSize: 10, lineHeight: 14, marginTop: 7 },
  roleTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  safe: { flex: 1 },
  screen: { flex: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX, paddingTop: 8 },
  signatureRail: { alignItems: 'center', borderRadius: 19, flexDirection: 'row', gap: 9, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10 },
  signatureRailAura: { backgroundColor: 'transparent', borderColor: 'rgba(64,205,190,0.36)', borderRadius: 21, borderWidth: 1, bottom: -2, boxShadow: '0px 0px 8px rgba(64,205,190,0.12)', left: -2, position: 'absolute', right: -2, top: -2 },
  signatureRailShell: { marginBottom: 14, marginTop: 18, position: 'relative' },
  signatureText: { color: entryTheme.color.mint.mint800, flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  sparkTile: { alignItems: 'center', backgroundColor: entryTheme.color.mint.mint50, borderRadius: 10, height: 23, justifyContent: 'center', width: 23 },
})
