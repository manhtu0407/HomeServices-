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
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { workerVerificationLabel } from '../ui/labels'
import { styles } from './verification-styles'

type WorkerV5VerificationProfile = WorkerProfileResponse | null | undefined
type WorkerV5VerificationIcons = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5VerificationAura = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type WorkerV5ReadOnlyToggleList = ComponentType<{
  items: ReadonlyArray<{ enabled: boolean; label: string; value: string }>
  reduceTransparency: boolean
}>

export type WorkerV5VerificationCheck = {
  done: boolean
  icon: WorkerV5IconName
  meta: string
  title: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function workerV5VerificationChecks(profile: WorkerV5VerificationProfile, language: AppLanguage): WorkerV5VerificationCheck[] {
  const services = profile?.service_types?.length
    ? profile.service_types.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có dịch vụ đã ghi', 'No saved services')
  const hasLegalIdentity = Boolean(profile?.has_selfie && profile?.legal_name?.trim())
  return [
    {
      done: Boolean(profile?.has_cccd),
      icon: 'document',
      meta: profile?.has_cccd
        ? textByLanguage(language, 'Đã có đối chiếu định danh', 'Identity source provided')
        : textByLanguage(language, 'Chưa có CCCD trong hồ sơ', 'No ID card in profile'),
      title: textByLanguage(language, 'CCCD / định danh', 'ID card'),
    },
    {
      done: hasLegalIdentity,
      icon: 'profile',
      meta: hasLegalIdentity
        ? textByLanguage(language, 'Ảnh hồ sơ khớp tên pháp lý', 'Profile photo matches legal name')
        : textByLanguage(language, 'Cần ảnh hồ sơ và tên pháp lý', 'Profile photo and legal name required'),
      title: textByLanguage(language, 'Lý lịch & ảnh đại diện', 'Profile and portrait'),
    },
    {
      done: Boolean(profile?.service_types?.length),
      icon: 'tools',
      meta: services,
      title: textByLanguage(language, 'Chứng chỉ nghề', 'Trade certificate'),
    },
    {
      done: profile?.verification_status === 'approved',
      icon: 'shield',
      meta: profile?.verification_status === 'approved'
        ? textByLanguage(language, 'Hồ sơ đã được duyệt', 'Profile approved')
        : workerVerificationLabel(profile?.verification_status, language),
      title: textByLanguage(language, 'Bảo hiểm trách nhiệm', 'Liability coverage'),
    },
  ]
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
        <Image resizeMode="contain" source={icons.shield} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-verification-count">{textByLanguage(language, `${completed}/${checks.length} hợp lệ`, `${completed}/${checks.length} valid`)}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-verification-title">{ready ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work') : textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Trạng thái pháp lý, chứng chỉ và bảo hiểm từ hồ sơ thật.', 'Legal status, documents, and coverage come from the real profile.')}</Text>
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
              resizeMode="contain"
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
              {check.done ? 'OK' : textByLanguage(language, 'Chờ', 'Wait')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5VerificationRenewalCard({
  language,
  profile,
  readOnlyToggleList: ReadOnlyToggleList,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5VerificationProfile
  readOnlyToggleList: WorkerV5ReadOnlyToggleList
  reduceTransparency: boolean
}) {
  const hasDocumentSource = Boolean(profile?.has_cccd || profile?.has_selfie || profile?.service_types?.length)
  return (
    <View testID="worker-v5-verification-renewal-card">
      <ReadOnlyToggleList
        items={[
          {
            enabled: hasDocumentSource,
            label: textByLanguage(language, 'Gợi nhắc trước 30 ngày', 'Send 30-day reminder'),
            value: hasDocumentSource
              ? textByLanguage(language, 'Kael theo dõi hạn giấy tờ đã đồng bộ trong hồ sơ.', 'Kael tracks renewal dates from synced profile documents.')
              : textByLanguage(language, 'Chưa có giấy tờ đủ nguồn để theo dõi hẹn.', 'No sourced document is available for renewal tracking.'),
          },
        ]}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}
