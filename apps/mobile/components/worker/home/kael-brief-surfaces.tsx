import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'

import type { WorkerV5IconName } from '../dock/types'
import { styles } from './action-styles'

type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5KaelBriefCard({
  auraScope,
  body,
  caseWideAura: CaseWideAura,
  icon,
  icons,
  reduceTransparency,
  source,
  title,
  zipAura: ZipAura,
}: {
  auraScope?: string
  body?: string
  caseWideAura?: WorkerV5CaseAuraComponent
  icon: WorkerV5IconName
  icons: WorkerV5IconMap
  reduceTransparency: boolean
  source?: ImageSourcePropType
  title: string
  zipAura?: WorkerV5CaseAuraComponent
}) {
  return (
    <View style={[styles.kaelBriefCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-brief-card">
      {auraScope && CaseWideAura && ZipAura && !reduceTransparency ? (
        <>
          <CaseWideAura scope={`${auraScope}Wide`} style={styles.kaelBriefAura} />
          <ZipAura scope={`${auraScope}Fine`} style={styles.kaelBriefZipAura} />
        </>
      ) : null}
      <View style={styles.kaelBriefIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={source ?? icons[icon]} style={styles.kaelBriefIcon} />
      </View>
      <View style={styles.kaelBriefText}>
        <Text style={styles.kaelBriefTitle}>{title}</Text>
        {body ? <Text style={styles.kaelBriefBody}>{body}</Text> : null}
      </View>
      <Text style={styles.kaelBriefChevron}>{'\u203a'}</Text>
    </View>
  )
}
