import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { workerV5VerificationChecks } from './verification-model'
import { styles } from './verification-styles'

type WorkerV5VerificationProfile = WorkerProfileResponse | null | undefined
type WorkerV5VerificationIcons = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5VerificationAura = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type WorkerV5ReadOnlyToggleList = ComponentType<{
  items: readonly { enabled: boolean; label: string; value: string }[]
  reduceTransparency: boolean
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5VerificationHero({
  icons,
  language,
  profile,
  reduceTransparency,
}: {
  icons: WorkerV5VerificationIcons
  language: AppLanguage
  profile: WorkerV5VerificationProfile
  reduceTransparency: boolean
}) {
  const checks = workerV5VerificationChecks(profile, language)
  const completed = checks.filter((check) => check.done).length
  const ready = completed === checks.length && Boolean(profile?.is_approved)
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-verification-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.earningsHeroAura} testID="worker-v5-verification-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image contentFit="contain" source={icons.shield} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-verification-count">{textByLanguage(language, `${completed}/${checks.length} mục đã ghi`, `${completed}/${checks.length} recorded`)}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-verification-title">{ready ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work') : textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Chỉ hiển thị giấy tờ, dịch vụ và trạng thái xét duyệt có trong hồ sơ.', 'Only recorded documents, services, and review status are shown.')}</Text>
      </View>
    </View>
  )
}

export function WorkerV5VerificationChecklist({
  caseWideAura: CaseWideAura,
  iconVisualBoost,
  icons,
  language,
  profile,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5VerificationAura
  iconVisualBoost: ReadonlySet<WorkerV5IconName>
  icons: WorkerV5VerificationIcons
  language: AppLanguage
  profile: WorkerV5VerificationProfile
  reduceTransparency: boolean
  zipAura: WorkerV5VerificationAura
}) {
  const checks = workerV5VerificationChecks(profile, language)
  return (
    <View style={[styles.verificationDocumentList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-verification-checklist">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="VerificationDocumentsWide" style={styles.verificationDocumentListAura} testID="worker-v5-verification-checklist-mint-aura" />
          <ZipAura scope="VerificationDocumentsFine" style={styles.verificationDocumentListZipAura} testID="worker-v5-verification-checklist-zip-mint-aura" />
        </>
      ) : null}
      {checks.map((check, index) => (
        <View
          key={check.title}
          style={[styles.verificationDocumentRow, index === checks.length - 1 ? styles.verificationDocumentRowLast : null]}
          testID={`worker-v5-verification-row-${index}`}
        >
          <View style={styles.verificationDocumentIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image
              contentFit="contain"
              source={icons[check.icon]}
              style={[styles.verificationDocumentIcon, iconVisualBoost.has(check.icon) ? styles.profileRouteIconVisualBoost : null]}
            />
          </View>
          <View style={styles.verificationDocumentCopy}>
            <Text style={styles.verificationDocumentTitle} numberOfLines={2} testID={`worker-v5-verification-row-title-${index}`}>{check.title}</Text>
            <Text style={styles.verificationDocumentMeta} numberOfLines={2} testID={`worker-v5-verification-row-meta-${index}`}>{check.meta}</Text>
          </View>
          <View style={[styles.verificationDocumentStatus, check.done ? styles.verificationDocumentStatusDone : null]}>
            <Text style={[styles.verificationDocumentStatusText, check.done ? styles.verificationDocumentStatusTextDone : null]} numberOfLines={1} testID={`worker-v5-verification-row-status-${index}`}>
              {check.done ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chờ', 'Wait')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5VerificationRenewalCard({
  language,
  readOnlyToggleList: ReadOnlyToggleList,
  reduceTransparency,
}: {
  language: AppLanguage
  readOnlyToggleList: WorkerV5ReadOnlyToggleList
  reduceTransparency: boolean
}) {
  return (
    <View testID="worker-v5-verification-renewal-card">
      <ReadOnlyToggleList
        items={[
          {
            enabled: false,
            label: textByLanguage(language, 'Gợi nhắc trước 30 ngày', 'Send 30-day reminder'),
            value: textByLanguage(language, 'Hồ sơ chưa có nguồn ngày hết hạn để theo dõi gia hạn.', 'No document-expiry source is available for renewal tracking.'),
          },
        ]}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}
