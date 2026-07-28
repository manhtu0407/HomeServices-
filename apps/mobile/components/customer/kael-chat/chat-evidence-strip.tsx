import { View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21Assets } from '../ui/assets'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import { MediaRow } from '../history/history-surfaces'
import { AssetTile } from '../ui/shared-surfaces'
import type { CustomerKaelMode } from '../ui/types'

export function ChatEvidenceStrip({
  formatCount,
  language,
  mediaCount,
  mode,
  tokens,
}: {
  formatCount: (value: number | null | undefined, language: AppLanguage) => string
  language: AppLanguage
  mediaCount: number | null | undefined
  mode: CustomerKaelMode
  tokens: CustomerThemeTokens
}) {
  const countLabel = formatCount(mediaCount, language)
  return (
    <View
      style={[
        chatStyles.chatEvidenceStrip,
        { backgroundColor: tokens.ghost, borderColor: tokens.border },
      ]}
      testID="customer-v21-chat-evidence-strip"
    >
      <MediaRow
        assetTile={AssetTile}
        image={mode === 'case' ? customerV21Assets.evidence : customerV21Assets.kael}
        label={mode === 'case'
          ? (language === 'vi' ? 'Bằng chứng công việc' : 'Work evidence')
          : (language === 'vi' ? 'Ảnh / video' : 'Photo / video')}
        tokens={tokens}
        value={countLabel}
      />
    </View>
  )
}
