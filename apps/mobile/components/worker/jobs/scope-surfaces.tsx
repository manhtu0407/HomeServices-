import type { ComponentType, ReactNode } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { scopeChangeDeltaLabel, scopeChangeStatusLabel } from '../ui/labels'
import { styles } from './scope-styles'

type WorkerV5ScopeAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5ScopeInfoRowProps = {
  icon: WorkerV5IconName
  label: string
  value: string
}

type WorkerV5ScopeMediaPreview = {
  fileName: string
  uri: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ScopeChangeHero({
  caseWideAura: CaseWideAura,
  language,
  reduceTransparency,
  scope,
  scopeIcon,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5ScopeAuraComponent
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
  scopeIcon: ImageSourcePropType
  zipAura: WorkerV5ScopeAuraComponent
}) {
  const title = scope?.requestedDescription || textByLanguage(language, 'Chưa có phát sinh thật', 'No real extra scope')
  const reason = scope?.reason || textByLanguage(language, 'Cần thông tin trước khi gửi khách phê duyệt', 'Details are required before customer review')
  return (
    <View style={[styles.scopeHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-scope-change-hero">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="ScopeChangeHeroWide" style={styles.scopeHeroAura} testID="worker-v5-scope-change-mint-aura" />
          <ZipAura scope="ScopeChangeHeroFine" style={styles.scopeHeroZipAura} testID="worker-v5-scope-change-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.scopeHeroIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={scopeIcon} style={styles.scopeHeroIcon} />
      </View>
      <View style={[styles.scopeHeroText, !scope && styles.scopeHeroTextNoPill]}>
        {scope ? <Text style={styles.scopeHeroPill} numberOfLines={1}>{scopeChangeStatusLabel(scope.status, language)}</Text> : null}
        <Text style={[styles.scopeHeroTitle, !scope && styles.scopeHeroTitleNoPill]} numberOfLines={2}>{title}</Text>
        <Text style={styles.scopeHeroMeta} numberOfLines={2}>{reason}</Text>
      </View>
    </View>
  )
}

export function WorkerV5ScopeEvidenceGate({
  deal,
  language,
  onAddPhotos,
  onScopeDescriptionChange,
  onScopeReasonChange,
  onSubmitScopeEvidence,
  onViewDetails,
  primaryButtonFill,
  reduceTransparency,
  renderInfoRow,
  scope,
  scopeDescription,
  scopeEvidenceOpen,
  scopeEvidenceSent,
  scopeMediaNotice,
  scopePhotos,
  scopeReason,
  scopeSubmitDisabled,
  scopeSubmitting,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  onAddPhotos: () => void | Promise<void>
  onScopeDescriptionChange: (value: string) => void
  onScopeReasonChange: (value: string) => void
  onSubmitScopeEvidence: () => void | Promise<void>
  onViewDetails: () => void
  primaryButtonFill: ReactNode
  reduceTransparency: boolean
  renderInfoRow: (props: WorkerV5ScopeInfoRowProps) => ReactNode
  scope: LocalDeal['scopeChange']
  scopeDescription: string
  scopeEvidenceOpen: boolean
  scopeEvidenceSent: boolean
  scopeMediaNotice: string | null
  scopePhotos: readonly WorkerV5ScopeMediaPreview[]
  scopeReason: string
  scopeSubmitDisabled: boolean
  scopeSubmitting: boolean
}) {
  if (!scope && !scopeEvidenceOpen) return null

  return (
    <>
      {scope && !scopeEvidenceOpen ? (
        <View style={[styles.glassCard, reduceTransparency && styles.opaqueCard]} testID="worker-scope-change-active">
          <View style={styles.sectionStack} testID="worker-scope-change-reference-card">
            <View testID="worker-scope-change-reference-old">
              {renderInfoRow({
                icon: 'document',
                label: textByLanguage(language, 'Phạm vi hiện tại', 'Original scope'),
                value: deal?.draft.description || textByLanguage(language, 'Chưa có phạm vi thật', 'No real scope'),
              })}
            </View>
            <View testID="worker-scope-change-reference-new">
              {renderInfoRow({
                icon: 'scope',
                label: textByLanguage(language, 'Phạm vi mới', 'New scope'),
                value: scope.requestedDescription || textByLanguage(language, 'Chưa có nháp thật', 'No real draft'),
              })}
            </View>
            <View testID="worker-scope-change-reference-reason">
              {renderInfoRow({
                icon: 'document',
                label: textByLanguage(language, 'Lý do', 'Reason'),
                value: scope.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason'),
              })}
            </View>
            <View testID="worker-scope-change-reference-media">
              {renderInfoRow({
                icon: 'evidence',
                label: textByLanguage(language, 'Ảnh bằng chứng', 'Evidence photos'),
                value: scope.evidencePhotoUrls.length ? textByLanguage(language, `${scope.evidencePhotoUrls.length} ảnh`, `${scope.evidencePhotoUrls.length} photos`) : textByLanguage(language, 'Chưa có ảnh', 'No photos'),
              })}
            </View>
            <View testID="worker-scope-change-reference-delta">
              {renderInfoRow({
                icon: 'wallet',
                label: textByLanguage(language, 'Chi phí phát sinh', 'Kael delta'),
                value: scopeChangeDeltaLabel(deal, scope, language),
              })}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onViewDetails}
            style={styles.navButtonSecondary}
            testID="worker-scope-change-detail-action"
          >
            <Text style={styles.navButtonText}>{textByLanguage(language, 'Xem chi tiết', 'View details')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.glassCard, reduceTransparency && styles.opaqueCard]} testID="worker-scope-change-request">
          <View style={styles.sectionStack} testID="worker-scope-change-evidence-form">
            <KaelTextField
              inputShellStyle={styles.workerChatTextFieldShell}
              multiline
              onChangeText={onScopeDescriptionChange}
              placeholder={textByLanguage(language, 'VD: cần thay thêm đoạn dây bị cháy...', 'Example: replace the burnt wire section...')}
              placeholderTextColor={color.text.muted}
              shellStyle={styles.workerChatTextFieldStack}
              testID="worker-scope-change-new-description-input"
              value={scopeDescription}
            />
            <KaelTextField
              inputShellStyle={styles.workerChatTextFieldShell}
              multiline
              onChangeText={onScopeReasonChange}
              placeholder={textByLanguage(language, 'Mô tả dấu hiệu thực tế Kael cần kiểm tra.', 'Describe the real on-site signal for Kael.')}
              placeholderTextColor={color.text.muted}
              shellStyle={styles.workerChatTextFieldStack}
              testID="worker-scope-change-reason-input"
              value={scopeReason}
            />
            <View style={styles.scopePhotoPickerRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void onAddPhotos()}
                style={({ pressed }) => [
                  styles.navButton,
                  styles.navButtonSecondary,
                  styles.scopePhotoPickerButton,
                  pressed ? styles.pressed : null,
                ]}
                testID="worker-scope-change-add-photo"
              >
                <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.navButtonText}>{textByLanguage(language, 'Thêm ảnh', 'Add photos')}</Text>
              </Pressable>
              <Text style={[styles.authorityText, styles.scopePhotoPickerHint]} testID="worker-scope-change-photo-count">
                {scopePhotos.length > 0
                  ? textByLanguage(language, `${scopePhotos.length} ảnh đã chọn`, `${scopePhotos.length} photos selected`)
                  : textByLanguage(language, 'Ảnh là tùy chọn; video chưa hỗ trợ ở bước này.', 'Photos are optional; video is not supported here yet.')}
              </Text>
            </View>
            {scopePhotos.length > 0 ? (
              <View style={styles.privateKaelMediaRail} testID="worker-scope-change-photo-preview-rail">
                {scopePhotos.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={styles.privateKaelMediaPreview} testID={`worker-scope-change-photo-preview-${index}`}>
                    <Image source={{ uri: item.uri }} style={styles.privateKaelMediaImage} testID={`worker-scope-change-photo-preview-image-${index}`} />
                    <Text numberOfLines={1} style={styles.privateKaelMediaText}>{item.fileName}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {scopeMediaNotice ? <Text style={styles.authorityText}>{scopeMediaNotice}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: scopeSubmitting, disabled: scopeSubmitDisabled }}
              disabled={scopeSubmitDisabled}
              onPress={() => void onSubmitScopeEvidence()}
              style={({ pressed }) => [
                styles.navButton,
                styles.navButtonPrimary,
                styles.primaryActionButtonSource,
                styles.scopeSubmitButton,
                scopeSubmitDisabled && styles.scopeSubmitDisabled,
                pressed && !scopeSubmitDisabled ? styles.pressed : null,
              ]}
              testID="worker-scope-change-confirm-submit"
            >
              {primaryButtonFill}
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={[styles.navButtonPrimaryText, styles.scopeSubmitButtonText, scopeSubmitDisabled && styles.scopeSubmitDisabledText]}
              >
                {scopeEvidenceSent ? textByLanguage(language, 'Đã gửi cho Kael', 'Sent to Kael') : scopeSubmitting ? textByLanguage(language, 'Đang gửi cho Kael', 'Sending to Kael') : textByLanguage(language, 'Gửi cho Kael kiểm tra', 'Send for Kael review')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  )
}
