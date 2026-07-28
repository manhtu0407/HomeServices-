import { Image } from 'expo-image'
import { View } from 'react-native'

import { SourceIconAura } from '../ui/aura-surfaces'
import { customerV21Assets } from '../ui/assets'
import { customerV21ProfileUtilityStyles as styles } from './profile-utility-styles'

export function ProfileUsageRankingMark({ testID }: { testID?: string }) {
  return (
    <View style={styles.profileRankingEntryIcon} testID={testID}>
      <SourceIconAura />
      <Image
        contentFit="contain"
        source={customerV21Assets.usageRanking}
        style={styles.profileRankingEntryIconImage}
        testID={testID ? `${testID}-image` : undefined}
      />
    </View>
  )
}
