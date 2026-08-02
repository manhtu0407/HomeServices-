import { Image } from 'expo-image'
import {
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'

import { styles } from './integrated-icon-styles'

type WorkerV5IntegratedIconVariant =
  | 'compact'
  | 'compactPanel'
  | 'hero'
  | 'heroPanel'
  | 'panel'
  | 'rail'
  | 'stage'
  | 'stagePanel'
type WorkerV5IntegratedIconEdge = 'left' | 'none' | 'right'
export type WorkerV5IntegratedIconTone = 'action' | 'document' | 'identity' | 'location' | 'money' | 'service' | 'signal'

export function WorkerV5IntegratedIcon({
  bleed = 0,
  edge = 'right',
  image,
  imageScale = 1,
  imageTranslationX = 0,
  imageTranslationY = 0,
  reduceTransparency,
  showAura = true,
  style,
  testID,
  tone = 'service',
  variant = 'rail',
}: {
  bleed?: number
  edge?: WorkerV5IntegratedIconEdge
  image: ImageSourcePropType
  imageScale?: number
  imageTranslationX?: number
  imageTranslationY?: number
  reduceTransparency: boolean
  showAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  tone?: WorkerV5IntegratedIconTone
  variant?: WorkerV5IntegratedIconVariant
}) {
  const isPanel = variant === 'compactPanel' || variant === 'heroPanel' || variant === 'panel' || variant === 'stagePanel'
  const anchorStyle = variant === 'compact'
    ? styles.iconAnchorCompact
    : variant === 'compactPanel'
      ? styles.iconAnchorCompactPanel
      : variant === 'hero'
        ? styles.iconAnchorHero
        : variant === 'heroPanel'
          ? styles.iconAnchorHeroPanel
          : variant === 'panel'
            ? styles.iconAnchorPanel
            : variant === 'stage'
              ? styles.iconAnchorStage
              : variant === 'stagePanel'
                ? styles.iconAnchorStagePanel
                : styles.iconAnchorRail
  const imageStyle = variant === 'compact'
    ? styles.iconImageCompact
    : variant === 'compactPanel'
      ? styles.iconImageCompactPanel
      : variant === 'hero'
        ? styles.iconImageHero
        : variant === 'heroPanel'
          ? styles.iconImageHeroPanel
          : variant === 'panel'
            ? styles.iconImagePanel
            : variant === 'stage'
              ? styles.iconImageStage
              : variant === 'stagePanel'
                ? styles.iconImageStagePanel
                : styles.iconImage
  const hasConnector = edge !== 'none' && variant !== 'stage' && variant !== 'stagePanel'
  const connectorStyle = edge === 'left' ? styles.connectorLeft : styles.connectorRight
  const dotStyle = edge === 'left' ? styles.dotLeft : styles.dotRight
  const panelDividerStyle = isPanel && edge !== 'none'
    ? edge === 'left' ? styles.panelDividerLeft : styles.panelDividerRight
    : null
  const panelToneStyle = isPanel
    ? tone === 'action'
      ? styles.panelToneAction
      : tone === 'document'
        ? styles.panelToneDocument
        : tone === 'identity'
          ? styles.panelToneIdentity
          : tone === 'location'
            ? styles.panelToneLocation
            : tone === 'money'
              ? styles.panelToneMoney
              : tone === 'signal'
                ? styles.panelToneSignal
                : styles.panelToneService
    : null
  const bleedStyle = isPanel && bleed
    ? edge === 'left'
      ? { marginBottom: -bleed, marginRight: -bleed, marginTop: -bleed }
      : edge === 'right'
        ? { marginBottom: -bleed, marginLeft: -bleed, marginTop: -bleed }
        : { marginHorizontal: -bleed, marginTop: -bleed }
    : null

  return (
    <View
      style={[styles.iconAnchor, anchorStyle, panelToneStyle, panelDividerStyle, reduceTransparency && styles.iconAnchorOpaque, bleedStyle, style]}
      testID={testID}
    >
      {!reduceTransparency && showAura ? <MintAura intensity="iconTile" style={styles.mintAura} /> : null}
      <Image
        contentFit="contain"
        source={image}
        style={[
          styles.iconImage,
          imageStyle,
          imageScale !== 1 || imageTranslationX !== 0 || imageTranslationY !== 0
            ? { transform: [{ translateX: imageTranslationX }, { translateY: imageTranslationY }, { scale: imageScale }] }
            : null,
        ]}
        testID={testID ? `${testID}-image` : undefined}
      />
      {hasConnector ? <View pointerEvents="none" style={[styles.connector, connectorStyle]} /> : null}
      {hasConnector ? <View pointerEvents="none" style={[styles.connectorDot, dotStyle]} /> : null}
    </View>
  )
}
