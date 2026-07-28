import { StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from '../ui/aura-surfaces'
import { customerV21Assets } from '../ui/assets'
import {
  MediaAnalyzeButtonAura,
  MediaDescriptionChip,
  MediaEvidenceSlot,
  MediaHeroAura,
  MediaPrepAura,
  MediaPrepListAura,
  MediaPrepRow,
  MediaVoiceNote,
} from './booking-surfaces'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { AssetTile, EyebrowPill, SectionActionHeader, V21Card } from '../ui/shared-surfaces'

export function MediaIntakeView({
  caseLabel,
  description,
  doneText,
  emptyText,
  hasAnyInput,
  hasDescription,
  hasProblems,
  language,
  mediaCount,
  mediaTitle,
  mediaValue,
  microNote,
  onSubmit,
  onVoicePress,
  problemChips,
  recordingSeconds,
  reduceTransparency,
  runningText,
  tokens,
  totalFileCount,
  totalFileValue,
  voiceCount,
  voiceError,
  voiceValue,
  waitingText,
  isRecordingVoice,
}: {
  caseLabel: string
  description: string
  doneText: string
  emptyText: string
  hasAnyInput: boolean
  hasDescription: boolean
  hasProblems: boolean
  isRecordingVoice: boolean
  language: AppLanguage
  mediaCount: number
  mediaTitle: string
  mediaValue: string
  microNote: string
  onSubmit: () => void
  onVoicePress: () => void
  problemChips: string[]
  recordingSeconds: number
  reduceTransparency: boolean
  runningText: string
  tokens: CustomerThemeTokens
  totalFileCount: number
  totalFileValue: string
  voiceCount: number
  voiceError: string | null
  voiceValue: string
  waitingText: string
}) {
  return (
    <View testID="customer-v21-screen-2.3-media">
      <View style={bookingStyles.mediaCaseRow} testID="customer-v21-media-case-row">
        <EyebrowPill label={caseLabel} preserveCase testID="customer-v21-media-case-pill" tokens={tokens} />
      </View>

      <V21Card glass style={[bookingStyles.mediaCard, bookingStyles.mediaHeroCard]} testID="customer-v21-media-intake">
        <SourceCardSkin testID="customer-v21-media-hero-card-skin" />
        <MediaHeroAura reduceTransparency={reduceTransparency} />
        <View style={bookingStyles.mediaHeroContent}>
          <View style={sharedStyles.rowBetween}>
            <View style={viewStyles.flex}>
              <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Ảnh & video hiện trạng' : 'Current media'}</Text>
              <Text style={[viewStyles.bodyText, bookingStyles.mediaCaptionText, { color: tokens.muted }]}>
                {language === 'vi' ? 'Kael dùng để phân tích, tách khỏi trò chuyện thường.' : 'Kael uses this for analysis, separate from normal chat.'}
              </Text>
            </View>
            <AssetTile image={customerV21Assets.evidence} label={mediaTitle} size={48} sourceAura style={bookingStyles.mediaHeroIcon} />
          </View>

          <View style={bookingStyles.mediaStrip}>
            <MediaEvidenceSlot active={mediaCount > 0} image={customerV21Assets.evidence} label={language === 'vi' ? 'Ảnh/video' : 'Media'} testID="customer-v21-media-slot-files" tokens={tokens} value={mediaValue} />
            <MediaEvidenceSlot active={voiceCount > 0} image={customerV21Assets.kael} label={language === 'vi' ? 'Giọng nói' : 'Voice'} testID="customer-v21-media-slot-voice" tokens={tokens} value={voiceValue} />
            <MediaEvidenceSlot active={totalFileCount > 0} image={customerV21Assets.request} label={language === 'vi' ? 'Tệp' : 'Files'} testID="customer-v21-media-slot-extra" tokens={tokens} value={totalFileValue} />
          </View>

          <MediaVoiceNote
            isRecording={isRecordingVoice}
            language={language}
            onPress={onVoicePress}
            recordingSeconds={recordingSeconds}
            testID="customer-v21-media-voice-note"
            tokens={tokens}
            value={isRecordingVoice ? `${recordingSeconds}s` : voiceValue}
          />
          {voiceError ? <Text style={[bookingStyles.mediaVoiceError, { color: tokens.primary }]} testID="customer-v21-media-voice-error">{voiceError}</Text> : null}
        </View>
      </V21Card>

      <SectionActionHeader
        action={hasDescription ? (language === 'vi' ? 'Sửa' : 'Edit') : undefined}
        title={language === 'vi' ? 'Mô tả của bạn' : 'Your description'}
      />
      <V21Card style={[bookingStyles.mediaCard, bookingStyles.mediaSourceListCard, bookingStyles.mediaDescriptionCard]} testID="customer-v21-media-description">
        <SourceCardSkin testID="customer-v21-media-description-card-skin" />
        <Text style={[viewStyles.bodyText, bookingStyles.mediaDescriptionQuote, { color: hasDescription ? tokens.text : tokens.muted }]}>
          {hasDescription ? description.trim() : emptyText}
        </Text>
        <View style={sharedStyles.heroChipRow}>
          {hasProblems ? problemChips.map((chip) => (
            <MediaDescriptionChip key={chip} label={chip} reduceTransparency={reduceTransparency} selected />
          )) : (
            <MediaDescriptionChip label={emptyText} reduceTransparency={reduceTransparency} testID="customer-v21-media-description-empty-chip" />
          )}
        </View>
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Chi tiết' : 'Details'}
        title={language === 'vi' ? 'Kael đang chuẩn bị Thông tin' : 'Kael is preparing the information'}
      />
      <V21Card style={[bookingStyles.mediaCard, bookingStyles.mediaSourceListCard, bookingStyles.mediaPrepSourceCard]} testID="customer-v21-media-prep">
        <SourceCardSkin testID="customer-v21-media-prep-card-skin" />
        <MediaPrepAura reduceTransparency={reduceTransparency} />
        <View style={bookingStyles.mediaPrepStepList}>
          <MediaPrepListAura reduceTransparency={reduceTransparency} />
          <MediaPrepRow index={1} label={language === 'vi' ? 'Đọc mô tả' : 'Read description'} state={hasDescription ? 'done' : 'idle'} tokens={tokens} value={hasDescription ? doneText : emptyText} />
          <MediaPrepRow index={2} label={language === 'vi' ? 'Phân loại ảnh & giọng nói' : 'Classify media and voice'} state={totalFileCount > 0 ? 'done' : 'idle'} tokens={tokens} value={totalFileValue} />
          <MediaPrepRow index={3} label={language === 'vi' ? 'Phát hiện rủi ro' : 'Detect risk'} state={hasAnyInput ? 'active' : 'idle'} tokens={tokens} value={hasAnyInput ? runningText : emptyText} />
          <MediaPrepRow index={4} label={language === 'vi' ? 'Tạo đề xuất ban đầu' : 'Draft recommendation'} state="idle" tokens={tokens} value={waitingText} />
        </View>
      </V21Card>

      <KaelButton
        backgroundLayer={<MediaAnalyzeButtonAura reduceTransparency={reduceTransparency} />}
        label={language === 'vi' ? 'Gửi để Kael phân tích' : 'Send for Kael analysis'}
        onPress={onSubmit}
        style={bookingStyles.mediaAnalyzeButton}
        testID="customer-v21-media-analyze"
      />
      <Text style={[bookingStyles.mediaMicroNote, { color: tokens.muted }]} testID="customer-v21-media-micro-note">{microNote}</Text>
    </View>
  )
}

const viewStyles = StyleSheet.create({
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  flex: {
    flex: 1,
  },
})
