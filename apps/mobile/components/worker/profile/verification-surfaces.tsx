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

import type { AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5VerificationChecks } from './verification-model'
import { WorkerV5ProfileFormulaCard } from './worker-profile-formula-surfaces'
import { styles as formulaStylesLight } from './worker-profile-formula-styles'
import { styles as stylesLight } from './verification-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

type WorkerV5VerificationProfile = WorkerProfileResponse | null | undefined
type WorkerV5VerificationIcons = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5VerificationAura = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type WorkerV5ReadOnlyToggleList = ComponentType<{
  formula?: boolean
  items: readonly { enabled: boolean; label: string; value: string }[]
  reduceTransparency: boolean
}>

function Text({ style, ...props }: TextProps) {
  const styles = useWorkerThemedStyles(stylesLight)
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
  const formulaStyles = useWorkerThemedStyles(formulaStylesLight)
  const styles = useWorkerThemedStyles(stylesLight)
  const checks = workerV5VerificationChecks(profile, language)
  const completed = checks.filter((check) => check.done).length
  const ready = completed === checks.length && Boolean(profile?.is_approved)
  return (
    <WorkerV5ProfileFormulaCard
      auraTestID="worker-v5-verification-mint-aura"
      contentStyle={[formulaStyles.heroContent, styles.formulaHeroContent]}
      reduceTransparency={reduceTransparency}
      scope="WorkerVerificationHero"
      style={styles.formulaHeroCard}
      testID="worker-v5-verification-hero"
    >
      <View style={styles.earningsHeroIconShell}>
        <WorkerV5FormulaMintCardAura
          reduceTransparency={reduceTransparency}
          scope="WorkerVerificationHeroIcon"
          style={styles.iconTileMintAura}
          testID="worker-v5-verification-hero-icon-mint-aura"
        />
        <Image contentFit="contain" source={icons.shield} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-verification-count">{textByLanguage(language, `${completed}/${checks.length} mục đã ghi`, `${completed}/${checks.length} recorded`)}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-verification-title">{ready ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work') : textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Chỉ hiển thị giấy tờ, dịch vụ và trạng thái xét duyệt có trong hồ sơ.', 'Only recorded documents, services, and review status are shown.')}</Text>
      </View>
    </WorkerV5ProfileFormulaCard>
  )
}

export function WorkerV5VerificationChecklist({
  caseWideAura: _caseWideAura,
  iconVisualBoost,
  icons,
  language,
  profile,
  reduceTransparency,
  zipAura: _zipAura,
}: {
  caseWideAura: WorkerV5VerificationAura
  iconVisualBoost: ReadonlySet<WorkerV5IconName>
  icons: WorkerV5VerificationIcons
  language: AppLanguage
  profile: WorkerV5VerificationProfile
  reduceTransparency: boolean
  zipAura: WorkerV5VerificationAura
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  const checks = workerV5VerificationChecks(profile, language)
  return (
    <WorkerV5ProfileFormulaCard
      auraTestID="worker-v5-verification-checklist-mint-aura"
      contentStyle={styles.verificationDocumentListContent}
      reduceTransparency={reduceTransparency}
      scope="WorkerVerificationChecklist"
      style={styles.verificationDocumentList}
      testID="worker-v5-verification-checklist"
    >
      {checks.map((check, index) => (
        <View
          key={check.title}
          style={[styles.verificationDocumentRow, index === checks.length - 1 ? styles.verificationDocumentRowLast : null]}
          testID={`worker-v5-verification-row-${index}`}
        >
          <View style={styles.verificationDocumentIconTile}>
            <WorkerV5FormulaMintCardAura
              reduceTransparency={reduceTransparency}
              scope={`WorkerVerificationDocumentIcon${index}`}
              style={styles.iconTileMintAura}
              testID={`worker-v5-verification-row-${index}-mint-aura`}
            />
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
    </WorkerV5ProfileFormulaCard>
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
        formula
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
