import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { styles as lightStyles } from './worker-profile-formula-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

export function WorkerV5ProfileFormulaCard({
  auraTestID,
  children,
  contentStyle,
  reduceTransparency,
  scope,
  style,
  testID,
}: {
  auraTestID?: string
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  reduceTransparency: boolean
  scope: string
  style?: StyleProp<ViewStyle>
  testID: string
}) {
  const styles = useWorkerThemedStyles(lightStyles)
  return (
    <View style={[styles.card, style]} testID={testID}>
      {!reduceTransparency ? (
        <WorkerV5FormulaMintCardAura
          scope={scope}
          testID={auraTestID ?? `${testID}-formula-mint-aura`}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  )
}
