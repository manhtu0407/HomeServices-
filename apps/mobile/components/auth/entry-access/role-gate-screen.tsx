import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PrimaryButton, useEntryAccessibility } from './components/materials'
import { EntryIcon } from './components/icons'
import { entryTheme } from './theme'
import type { EntryAccessCopy } from './copy'
import type { RoleGateGreeting } from './role-gate-greeting'
import type { EntryRole } from './types'

const roleAssets = {
  customerHome: require('./assets/customer-home.png') as ImageSourcePropType,
  workerTools: require('./assets/worker-tools.png') as ImageSourcePropType,
}

const roleMintEnter = FadeIn.duration(380)
const roleMintExit = FadeOut.duration(180)

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
        <DecisionField copy={copy} onRoleChange={onRoleChange} role={role} />
        <View style={styles.gateBottom}>
          <PrimaryButton label={role === 'customer' ? copy.continueCustomer : copy.continueWorker} onPress={onContinue} testID="auth-role-continue" />
          <Text style={[styles.caption, styles.gateFoot]}>{copy.footer}</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

function DecisionField({ copy, onRoleChange, role }: {
  copy: EntryAccessCopy['roleGate']
  onRoleChange: (role: EntryRole) => void
  role: EntryRole
}) {
  const { reduceMotion, reduceTransparency } = useEntryAccessibility()

  return (
    <View style={styles.decisionField} testID="auth-role-gate-decision-field">
      <View pointerEvents="none" style={styles.decisionSurface}>
        {!reduceTransparency ? <View style={styles.decisionWash} /> : null}
      </View>
      <View accessibilityLabel={copy.chooseRole} accessibilityRole="radiogroup" style={styles.roleList} testID="auth-entry-role-options">
        <RoleCard
          assetTreatment="home"
          description={copy.customer.description}
          meta={copy.customer.meta}
          onPress={() => onRoleChange('customer')}
          reduceMotion={reduceMotion}
          selected={role === 'customer'}
          source={roleAssets.customerHome}
          testID="auth-entry-role-customer"
          title={copy.customer.title}
        />
        <RoleCard
          assetTreatment="tools"
          description={copy.worker.description}
          meta={copy.worker.meta}
          onPress={() => onRoleChange('worker')}
          reduceMotion={reduceMotion}
          selected={role === 'worker'}
          source={roleAssets.workerTools}
          testID="auth-entry-role-worker"
          title={copy.worker.title}
        />
      </View>
    </View>
  )
}

function RoleCard({ assetTreatment, description, meta, onPress, reduceMotion, selected, source, testID, title }: {
  assetTreatment: 'home' | 'tools'
  description: string
  meta: string
  onPress: () => void
  reduceMotion: boolean
  selected: boolean
  source: ImageSourcePropType
  testID: string
  title: string
}) {
  return (
    <View style={selected ? styles.roleCardSelectedShell : styles.roleCardPassiveShell} testID={`${testID}-layout`}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }: { pressed: boolean }) => [styles.roleCard, selected ? styles.roleCardSelected : styles.roleCardPassive, pressed && styles.pressed]} testID={testID}>
        {selected ? <Animated.View entering={reduceMotion ? undefined : roleMintEnter} exiting={reduceMotion ? undefined : roleMintExit} pointerEvents="none" style={styles.roleMintPool} /> : null}
        {selected ? <View pointerEvents="none" style={styles.roleCardHighlight} /> : null}
        <View style={styles.roleAssetAnchor}>
          <RoleAssetTile selected={selected} source={source} treatment={assetTreatment} />
        </View>
        <View style={styles.roleCopy}>
          <View style={styles.roleTitleRow}>
            <Text style={styles.h3}>{title}</Text>
          </View>
          <Text style={styles.roleDescription}>{description}</Text>
          <Text style={styles.roleMeta}>{meta}</Text>
        </View>
        <View style={[styles.roleArrow, selected && styles.roleArrowSelected]}><EntryIcon color={entryTheme.color.mint.mint700} name="arrow-right" size={13} /></View>
      </Pressable>
    </View>
  )
}

function RoleAssetTile({ selected, source, treatment }: { selected: boolean; source: ImageSourcePropType; treatment: 'home' | 'tools' }) {
  return (
    <View style={styles.roleAssetStage}>
      {selected ? <View pointerEvents="none" style={styles.roleAssetCradle} /> : null}
      <Image contentFit="contain" source={source} style={treatment === 'tools' ? styles.roleAssetImageTools : styles.roleAssetImageHome} />
    </View>
  )
}

const styles = StyleSheet.create({
  caption: { ...entryTheme.typography.caption, color: entryTheme.color.text.muted },
  decisionField: { flex: 1, marginTop: 18, padding: 10, position: 'relative' },
  decisionSurface: { backgroundColor: 'rgba(255,255,255,0.80)', borderColor: 'rgba(184,231,223,0.72)', borderRadius: 34, borderWidth: 1, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  decisionWash: { backgroundColor: 'rgba(230,251,243,0.50)', borderRadius: 32, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  gateBottom: { paddingTop: 12 },
  gateFoot: { marginTop: 10, textAlign: 'center' },
  gateGreetingTitle: { fontSize: 29, lineHeight: 35 },
  gateHead: { paddingHorizontal: 4, paddingTop: 8 },
  h1: { ...entryTheme.typography.h1, color: entryTheme.color.text.strong },
  h3: { ...entryTheme.typography.h3, color: entryTheme.color.text.strong },
  lead: { ...entryTheme.typography.body, color: entryTheme.color.text.secondary },
  pressed: { opacity: 0.92 },
  roleArrow: { alignItems: 'center', backgroundColor: 'rgba(230,251,243,0.76)', borderColor: 'rgba(184,231,223,0.64)', borderRadius: 15, borderWidth: 1, height: 30, justifyContent: 'center', width: 30, zIndex: 1 },
  roleArrowSelected: { backgroundColor: 'rgba(230,251,243,0.94)', boxShadow: '0px 7px 10px rgba(8,135,121,0.10)' },
  roleAssetAnchor: { position: 'relative', zIndex: 1 },
  roleAssetCradle: { backgroundColor: 'rgba(207,247,237,0.82)', borderRadius: 28, height: 82, position: 'absolute', width: 82 },
  roleAssetImageHome: { height: 80, width: 80 },
  roleAssetImageTools: { height: 88, width: 88 },
  roleAssetStage: { alignItems: 'center', height: 82, justifyContent: 'center', width: 82 },
  roleCard: { alignItems: 'center', borderRadius: entryTheme.radius.card, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 13, minHeight: 0, overflow: 'hidden', paddingHorizontal: 15, paddingVertical: 16 },
  roleCardHighlight: { backgroundColor: 'rgba(255,255,255,0.72)', height: 1, left: 20, position: 'absolute', right: 20, top: 1 },
  roleCardSelected: { backgroundColor: 'rgba(241,251,248,0.96)', borderColor: 'transparent', boxShadow: '0px 16px 17px rgba(8,135,121,0.13)' },
  roleCardSelectedShell: { flex: 3 },
  roleCardPassive: { backgroundColor: 'transparent', borderColor: 'transparent' },
  roleCardPassiveShell: { flex: 1 },
  roleCopy: { flex: 1, zIndex: 1 },
  roleMintPool: { backgroundColor: 'rgba(200,244,234,0.64)', borderRadius: 82, bottom: 12, left: 8, position: 'absolute', right: 8, top: 12 },
  roleDescription: { color: entryTheme.color.text.secondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  roleList: { flex: 1, gap: 0 },
  roleMeta: { color: entryTheme.color.text.muted, fontSize: 10, lineHeight: 14, marginTop: 7 },
  roleTitleRow: { alignItems: 'center', flexDirection: 'row' },
  safe: { flex: 1 },
  screen: { flex: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX, paddingTop: 8 },
})
