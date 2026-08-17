import { memo, useMemo } from 'react'
import { Image } from 'expo-image'
import Svg, { Defs, Rect } from 'react-native-svg'
import { Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import type { EntryAccessCopy } from './copy'
import type { EntryRole } from './types'

const defaultCustomerImage = require('./assets/customer-role.png') as ImageSourcePropType
const defaultWorkerImage = require('./assets/worker-role.png') as ImageSourcePropType

type RoleCardData = {
  id: EntryRole
  image: ImageSourcePropType
  testID: string
  title: string
}

type RoleCardProps = {
  accessibilityHint: string
  item: RoleCardData
  onSelect: (role: EntryRole) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  selected: boolean
  isLast: boolean
}

export type RoleSelectionCardsProps = {
  accessibilityHint: string
  chooseRoleLabel: string
  customer?: Pick<EntryAccessCopy['roleGate']['customer'], 'title'>
  customerImage?: ImageSourcePropType
  customerTestID?: string
  onSelect: (role: EntryRole) => void
  reduceMotion?: boolean
  reduceTransparency?: boolean
  selectedRole?: EntryRole | null
  worker?: Pick<EntryAccessCopy['roleGate']['worker'], 'title'>
  workerImage?: ImageSourcePropType
  workerTestID?: string
}

const RoleCard = memo(function RoleCard({
  accessibilityHint,
  isLast,
  item,
  onSelect,
  reduceMotion,
  reduceTransparency,
  selected,
}: RoleCardProps) {
  const artworkEdgeBlendId = `${item.testID}-artwork-edge-blend`

  return (
    <View style={[styles.cardSlot, !isLast && styles.cardSpacing]} testID={`${item.testID}-layout`}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={item.title}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={() => onSelect(item.id)}
        style={({ pressed }) => [
          styles.card,
          selected && styles.cardSelected,
          reduceTransparency && styles.cardOpaque,
          pressed && (reduceMotion ? styles.cardPressedReduced : styles.cardPressed),
        ]}
        testID={item.testID}
      >
        <Image
          accessible={false}
          contentFit="cover"
          source={item.image}
          style={styles.artwork}
          testID={`${item.testID}-image`}
        />
        <View pointerEvents="none" style={styles.artworkEdgeBlend} testID={`${item.testID}-artwork-edge-blend`}>
          <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
            <Defs>
              <LinearGradient id={artworkEdgeBlendId} x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor="rgba(255,255,255,0)" />
                <Stop offset="0.68" stopColor="rgba(255,255,255,0.28)" />
                <Stop offset="1" stopColor="rgba(255,255,255,0.82)" />
              </LinearGradient>
            </Defs>
            <Rect fill={`url(#${artworkEdgeBlendId})`} height="100" width="100" />
          </Svg>
        </View>
        {!reduceTransparency ? <View pointerEvents="none" style={styles.softGlassOverlay} /> : null}
        <View pointerEvents="none" style={[styles.silverLeftEdge, reduceTransparency && styles.silverLeftEdgeOpaque]} testID={`${item.testID}-silver-edge`} />
        <View pointerEvents="none" style={[styles.rightSilverPanel, reduceTransparency && styles.rightSilverPanelOpaque]} testID={`${item.testID}-right-silver-panel`} />
        <View pointerEvents="none" style={styles.copy} testID={`${item.testID}-copy`}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>
        </View>
      </Pressable>
    </View>
  )
})

export const RoleSelectionCards = memo(function RoleSelectionCards({
  accessibilityHint,
  chooseRoleLabel,
  customer = { title: 'Khách hàng' },
  customerImage = defaultCustomerImage,
  customerTestID = 'role-card-customer',
  onSelect,
  reduceMotion = false,
  reduceTransparency = false,
  selectedRole = null,
  worker = { title: 'Đối tác thợ' },
  workerImage = defaultWorkerImage,
  workerTestID = 'role-card-worker',
}: RoleSelectionCardsProps) {
  const roles = useMemo<readonly RoleCardData[]>(
    () => [
      { id: 'customer', image: customerImage, testID: customerTestID, title: customer.title },
      { id: 'worker', image: workerImage, testID: workerTestID, title: worker.title },
    ],
    [customer.title, customerImage, customerTestID, worker.title, workerImage, workerTestID],
  )

  return (
    <View accessibilityLabel={chooseRoleLabel} accessibilityRole="radiogroup" style={styles.container} testID="auth-entry-role-options">
      {roles.map((item, index) => (
        <RoleCard
          accessibilityHint={accessibilityHint}
          isLast={index === roles.length - 1}
          item={item}
          key={item.id}
          onSelect={onSelect}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          selected={selectedRole === item.id}
        />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  artwork: { bottom: 0, height: '100%', left: 0, position: 'absolute', top: 0, width: '50%' },
  artworkEdgeBlend: { bottom: 0, height: '100%', left: '42.5%', position: 'absolute', top: 0, width: '7.5%' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 29,
    borderWidth: 1.5,
    elevation: 5,
    minHeight: 214,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#2D5D59',
    shadowOffset: { height: 13, width: 0 },
    shadowOpacity: Platform.OS === 'ios' ? 0.11 : 0.14,
    shadowRadius: 20,
    width: '100%',
  },
  cardOpaque: { backgroundColor: '#FFFFFF', borderColor: '#D8EBE8' },
  cardPressed: { opacity: 0.97, transform: [{ scale: 0.987 }] },
  cardPressedReduced: { opacity: 0.97 },
  cardSelected: { borderColor: 'rgba(73,188,174,0.52)' },
  cardSlot: { width: '100%' },
  cardSpacing: { marginBottom: 18 },
  container: { alignSelf: 'center', maxWidth: 422, width: '100%' },
  copy: { left: '52.5%', position: 'absolute', right: 21, top: '50%', transform: [{ translateY: -14.5 }] },
  silverLeftEdge: {
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 29,
    borderColor: 'rgba(174,185,187,0.42)',
    borderLeftWidth: 1.5,
    borderTopLeftRadius: 29,
    borderTopWidth: 1.5,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: '50%',
  },
  silverLeftEdgeOpaque: { backgroundColor: 'rgba(207,214,215,0.1)', borderColor: 'rgba(164,176,178,0.52)' },
  rightSilverPanel: {
    backgroundColor: 'transparent',
    borderBottomRightRadius: 29,
    borderColor: 'rgba(174,185,187,0.16)',
    borderBottomWidth: 1,
    borderRightWidth: 1.5,
    borderTopRightRadius: 29,
    borderTopWidth: 1,
    bottom: 0,
    left: '50%',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  rightSilverPanelOpaque: { backgroundColor: 'transparent', borderColor: 'rgba(161,174,176,0.22)' },
  softGlassOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.05)' },
  title: { color: '#07383B', fontSize: 24.5, fontWeight: '700', letterSpacing: -0.7, lineHeight: 29 },
})
