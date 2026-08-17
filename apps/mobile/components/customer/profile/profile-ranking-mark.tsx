import { Image } from 'expo-image'
import { View } from 'react-native'

import { customerV21Assets } from '../ui/assets'
import { customerV21ProfileUtilityStyles as styles } from './profile-utility-styles'

export function ProfileUsageRankingMark({ testID }: { testID?: string }) {
  return (
    <View style={styles.profileRankingEntryIcon} testID={testID}>
      <Image
        contentFit="contain"
        source={customerV21Assets.usageRankingWorkart}
        style={styles.profileRankingEntryIconImage}
        testID={testID ? `${testID}-image` : undefined}
      />
    </View>
  )
}
