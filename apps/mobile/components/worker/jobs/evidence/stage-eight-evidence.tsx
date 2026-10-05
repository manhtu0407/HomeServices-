import React from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native'

import { type AppleTypographyRole } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { stageTypography } from '../stage-ratio'
import { textByLanguage } from '../../ui/format'
import { stageEightAssets } from './stage-eight-assets'
import { StageEightIcon, type StageEightIconName } from './stage-eight-icons'
import type { StageEightEvidenceProps } from './stage-eight.types'
import { useWorkerThemedStyles } from '../../ui/worker-dark-styles'

const BASE = 420
const C = {
  ink: '#082F29',
  mint: '#0E9E76',
  mintSoft: '#ECF8F4',
  mintPill: '#E2F6EF',
  danger: '#D75D57',
  dangerBg: '#FDE9E7',
  disabled: '#A2B3B8',
  disabledBg: '#E8EFF0',
}

function px(value: number, scale: number) {
  return value * scale
}

function StepPill({ label, active, scale, width, windowWidth }: { label: string; active?: boolean; scale: number; width: number; windowWidth: number }) {
  const styles = useWorkerThemedStyles(stylesLight)
  return (
    <View
      style={[
        styles.stepPill,
        {
          width: px(width, scale),
          height: px(34, scale),
          borderRadius: px(18, scale),
          paddingHorizontal: px(7, scale),
        },
        active && styles.stepPillActive,
      ]}
    >
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.9}
        numberOfLines={1}
        style={[
          stageTypography('caption1', windowWidth),
          styles.stepText,
          active && styles.stepTextActive,
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

function SectionHeader({
  icon,
  marginTop,
  right,
  scale,
  title,
  windowWidth,
}: {
  icon: StageEightIconName
  marginTop: number
  right?: React.ReactNode
  scale: number
  title: string
  windowWidth: number
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  return (
    <View style={[styles.sectionHeader, { marginTop: px(marginTop, scale) }]}>
      <View style={[styles.sectionLeft, { gap: px(8, scale) }]}>
        <StageEightIcon color={C.mint} name={icon} size={px(32, scale)} />
        <Text style={[stageTypography('body', windowWidth), styles.sectionTitle]}>{title}</Text>
      </View>
      {right}
    </View>
  )
}

function stageCopy(language: AppLanguage) {
  return {
    addPhoto: textByLanguage(language, 'Thêm ảnh', 'Add photo'),
    completeKicker: textByLanguage(language, 'HOÀN TẤT CÔNG VIỆC', 'COMPLETE THE JOB'),
    completeNote: textByLanguage(language, 'Có ghi chú hoàn tất', 'Completion note'),
    completePhoto: textByLanguage(language, 'Có ảnh hoàn tất', 'Completion photo'),
    completePhotoAdded: textByLanguage(language, 'Ảnh đã được thêm vào hồ sơ.', 'Photos have been added to the record.'),
    completePhotoTitle: textByLanguage(language, 'Ảnh hoàn tất', 'Completion photos'),
    completeRecord: textByLanguage(language, 'Gửi hồ sơ hoàn tất', 'Submit completion record'),
    completeRecordEmpty: textByLanguage(language, 'Chưa có hồ sơ\nhoàn tất', 'No completion record\nyet'),
    completeRecordPlaceholder: textByLanguage(language, 'Mô tả ngắn việc đã làm.', 'Briefly describe the completed work.'),
    completeRecordSending: textByLanguage(language, 'Đang gửi…', 'Sending…'),
    finalCheck: textByLanguage(language, 'Kiểm tra cuối', 'Final check'),
    hasEnough: textByLanguage(language, 'Đã đủ', 'Ready'),
    needsMore: textByLanguage(language, 'Cần bổ sung', 'Needs input'),
    noCompletionPhoto: textByLanguage(language, 'Chưa có ảnh hoàn tất', 'No completion photos yet'),
    noCompletionPhotoSubtitle: textByLanguage(language, 'Thêm ảnh trước khi gửi.', 'Add photos before sending.'),
    noteSubtitle: textByLanguage(language, 'Mô tả ngắn những việc bạn đã làm.', 'Briefly describe what you did.'),
    noteTitle: textByLanguage(language, 'Ghi chú hoàn tất', 'Completion note'),
    completionPhotoCount: (count: number) => textByLanguage(language, `${count} ảnh hoàn tất`, `${count} completion photos`),
    photoCount: (count: number) => textByLanguage(language, `${count} ảnh`, `${count} photos`),
    stepCurrent: textByLanguage(language, 'Bước 8 · Bằng chứng', 'Step 8 · Evidence'),
    stepNext: textByLanguage(language, 'Bước 9 · Đã gửi', 'Step 9 · Submitted'),
    stepPrevious: textByLanguage(language, 'Bước 7 · Chờ duyệt', 'Step 7 · Approval wait'),
    back: textByLanguage(language, 'Quay lại', 'Go back'),
  }
}

export function StageEightEvidenceScreen({
  currentStepLabel,
  embedded = false,
  language = 'vi',
  nextStepLabel,
  notice,
  note,
  onAddPhoto,
  onBack,
  onNoteChange,
  onSubmit,
  photoCount,
  previousStepLabel,
  showWorkflowHeader = true,
  submitting = false,
}: StageEightEvidenceProps) {
  const styles = useWorkerThemedStyles(stylesLight)
  const { width } = useWindowDimensions()
  const copy = stageCopy(language)
  const availableWidth = embedded ? Math.max(280, width - 32) : width
  const canvas = Math.min(availableWidth, BASE)
  const scale = canvas / BASE
  const hasPhoto = photoCount > 0
  const hasNote = note.trim().length >= 5
  const canSubmit = hasPhoto && hasNote && !!onSubmit && !submitting
  const resolvedPreviousStepLabel = previousStepLabel ?? copy.stepPrevious
  const resolvedCurrentStepLabel = currentStepLabel ?? copy.stepCurrent
  const resolvedNextStepLabel = nextStepLabel ?? copy.stepNext

  const content = (
    <View style={{ width: canvas, paddingHorizontal: px(17, scale) }}>
      {showWorkflowHeader ? (
        <>
          <View style={[styles.topRow, { height: px(36, scale) }]}>
            <Pressable
              accessibilityLabel={copy.back}
              accessibilityRole="button"
              onPress={onBack}
              style={[styles.back, { left: px(8, scale), width: px(34, scale), height: px(34, scale) }]}
            >
              <Text style={{ color: '#0B574A', fontSize: px(25, scale), lineHeight: px(26, scale) }}>‹</Text>
            </Pressable>
            <View style={[styles.brand, { gap: px(7, scale) }]}>
              <Image resizeMode="contain" source={stageEightAssets.logo} style={{ width: px(27, scale), height: px(26, scale) }} />
              <Text style={[stageTypography('body', width), styles.brandText]}>NestScout</Text>
            </View>
          </View>
          <View
            style={[
              styles.stepsWrap,
              {
                height: px(46, scale),
                marginHorizontal: px(-17, scale),
                paddingHorizontal: px(10, scale),
                paddingTop: px(4, scale),
                gap: px(7.5, scale),
              },
            ]}
          >
            <StepPill label={resolvedPreviousStepLabel} scale={scale} width={124} windowWidth={width} />
            <StepPill active label={resolvedCurrentStepLabel} scale={scale} width={138} windowWidth={width} />
            <StepPill label={resolvedNextStepLabel} scale={scale} width={123} windowWidth={width} />
          </View>
        </>
      ) : null}

      <View
        style={[
          styles.hero,
          {
            height: px(165, scale),
            marginTop: px(showWorkflowHeader ? 10 : 0, scale),
            borderRadius: px(15, scale),
            paddingLeft: px(22, scale),
            paddingTop: px(22, scale),
          },
        ]}
        testID="worker-v5-stage-eight-fidelity-hero"
      >
        <View style={{ width: px(205, scale), zIndex: 2 }}>
          <Text style={[stageTypography('caption2', width), styles.eyebrow]}>{copy.completeKicker}</Text>
          <Text style={[stageTypography('title2', width), styles.heroTitle, { marginTop: px(7, scale) }]}>{copy.completeRecordEmpty}</Text>
        </View>
        <Image
          resizeMode="cover"
          source={stageEightAssets.hero}
          style={{
            position: 'absolute',
            right: px(2, scale),
            top: px(12, scale),
            width: px(182, scale),
            height: px(153, scale),
            borderRadius: px(6, scale),
          }}
        />
      </View>

      <SectionHeader
        icon="camera"
        marginTop={18}
        right={<Text style={[stageTypography('footnote', width), styles.count, { top: px(1.6, scale) }]}>{copy.photoCount(photoCount)}</Text>}
        scale={scale}
        title={copy.completePhotoTitle}
        windowWidth={width}
      />

      <View
        style={[styles.upload, { marginTop: px(14, scale), height: px(96, scale), borderRadius: px(16, scale), paddingHorizontal: px(15, scale), gap: px(12, scale) }]}
        testID="worker-v5-stage-eight-fidelity-upload"
      >
        <Image resizeMode="contain" source={stageEightAssets.upload} style={{ width: px(56, scale), height: px(56, scale), flexShrink: 0 }} />
        <View style={{ flex: 1, minWidth: 0, paddingRight: px(118, scale) }}>
          <Text style={[stageTypography('footnote', width), styles.uploadTitle]}>
            {hasPhoto ? copy.completionPhotoCount(photoCount) : copy.noCompletionPhoto}
          </Text>
          <Text style={[stageTypography('caption2', width), styles.uploadSub, { marginTop: px(4, scale) }]}>
            {hasPhoto ? copy.completePhotoAdded : copy.noCompletionPhotoSubtitle}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={copy.addPhoto}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={onAddPhoto}
          style={[styles.addButton, { position: 'absolute', right: px(13, scale), height: px(40, scale), width: px(109, scale), borderRadius: px(20, scale), paddingHorizontal: px(6, scale), gap: px(3, scale) }]}
          testID="worker-v5-stage-eight-fidelity-add-photo"
        >
          <Text style={{ color: C.mint, fontSize: px(19, scale), lineHeight: px(20, scale) }}>＋</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.92} numberOfLines={1} style={[stageTypography('caption1', width), styles.addText]}>{copy.addPhoto}</Text>
        </Pressable>
      </View>

      <SectionHeader
        icon="checklist"
        marginTop={20}
        scale={scale}
        title={copy.finalCheck}
        windowWidth={width}
      />

      <View style={[styles.checkCard, { marginTop: px(13, scale), height: px(120, scale), borderRadius: px(15, scale), paddingHorizontal: px(12, scale) }]} testID="worker-v5-stage-eight-fidelity-final-check">
        {[
          { index: 1, title: copy.completePhoto, sub: textByLanguage(language, 'Cần có ít nhất 1 ảnh hiện trường sau khi hoàn thành.', 'At least one field photo is required after the work is complete.'), ok: hasPhoto },
          { index: 2, title: copy.completeNote, sub: copy.noteSubtitle, ok: hasNote },
        ].map((item, index) => (
          <View key={item.index} style={[styles.checkRow, { height: px(59.5, scale), gap: px(11, scale) }, index === 1 && styles.checkRowBorder]}>
            <View style={[styles.num, { width: px(32, scale), height: px(32, scale), borderRadius: px(16, scale) }]}>
              <Text style={[stageTypography('footnote', width), styles.numText]}>{item.index}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[stageTypography('footnote', width), styles.checkTitle]}>{item.title}</Text>
              <Text numberOfLines={1} style={[stageTypography('caption2', width), styles.checkSub]}>{item.sub}</Text>
            </View>
            <View style={[styles.statusPill, item.ok && styles.statusOk, { minWidth: px(76, scale), borderRadius: px(15, scale), paddingHorizontal: px(9, scale), paddingVertical: px(7, scale) }]}>
              <Text style={[stageTypography('caption2', width), styles.statusText, item.ok && styles.statusTextOk]}>{item.ok ? copy.hasEnough : copy.needsMore}</Text>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader
        icon="note"
        marginTop={15}
        scale={scale}
        title={copy.noteTitle}
        windowWidth={width}
      />

      <View style={[styles.noteBox, { marginTop: px(8, scale), height: px(88, scale), borderRadius: px(15, scale), paddingHorizontal: px(14, scale), paddingTop: px(12, scale) }]} testID="worker-v5-stage-eight-fidelity-note">
        <TextInput spellCheck={false}
          accessibilityLabel={copy.noteTitle}
          editable={!submitting}
          maxLength={500}
          multiline
          onChangeText={onNoteChange}
          placeholder={copy.completeRecordPlaceholder}
          placeholderTextColor="#81929A"
          style={[stageTypography('footnote', width), styles.input]}
          testID="worker-v5-stage-eight-fidelity-note-input"
          textAlignVertical="top"
          value={note}
        />
        <Text style={[stageTypography('caption2', width), styles.counter, { right: px(11, scale), bottom: px(9, scale) }]}>{note.length}/500</Text>
      </View>

      {notice ? <Text accessibilityLiveRegion="polite" style={[stageTypography('caption2', width), styles.notice]}>{notice}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        disabled={!canSubmit}
        onPress={onSubmit}
        style={[styles.submit, canSubmit && styles.submitEnabled, { marginTop: px(notice ? 8 : 13, scale), height: px(55, scale), borderRadius: px(17, scale) }]}
        testID="worker-v5-stage-eight-fidelity-submit"
      >
        <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[stageTypography('body', width), styles.submitText, canSubmit && styles.submitTextEnabled]}>
          {submitting ? copy.completeRecordSending : copy.completeRecord}
        </Text>
      </Pressable>
    </View>
  )

  const screen = <View style={[styles.root, embedded && styles.embeddedRoot]} testID="worker-v5-stage-eight-fidelity">{content}</View>
  return embedded ? screen : (
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: px(20, scale) }} showsVerticalScrollIndicator={false} style={styles.scrollRoot}>
      {screen}
    </ScrollView>
  )
}

const stylesLight = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', alignItems: 'center' },
  embeddedRoot: { width: '100%' },
  scrollRoot: { flex: 1, backgroundColor: '#FFFFFF' },
  topRow: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandText: { color: '#1F4C43', fontWeight: '700' },
  stepsWrap: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EDF0F1' },
  stepPill: { borderWidth: 1, borderColor: '#DBE4E7', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  stepPillActive: { backgroundColor: '#DEF4ED', borderColor: '#66C7A6' },
  stepText: { color: '#75848B', fontWeight: '600' },
  stepTextActive: { color: '#0C9A71' },
  hero: { backgroundColor: C.mintSoft, flexDirection: 'row', overflow: 'hidden' },
  eyebrow: { color: '#5B7771', fontWeight: '700' },
  heroTitle: { color: '#00332F', fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  sectionLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: '#071A20', flexShrink: 1, fontWeight: '700' },
  count: { color: '#08A078', fontWeight: '700' },
  upload: { position: 'relative', borderWidth: 1.3, borderStyle: 'dashed', borderColor: '#B7E5D8', flexDirection: 'row', alignItems: 'center' },
  uploadTitle: { color: '#071A20', fontWeight: '700' },
  uploadSub: { color: '#667980', fontWeight: '500' },
  addButton: { borderWidth: 1.2, borderColor: '#59C4A5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  addText: { color: C.mint, fontWeight: '700' },
  checkCard: { borderWidth: 1, borderColor: '#D6E0E4', overflow: 'hidden', backgroundColor: '#FFFFFF' },
  checkRow: { flexDirection: 'row', alignItems: 'center' },
  checkRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9EDEF' },
  num: { backgroundColor: C.mintPill, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#0F9C74', fontWeight: '700' },
  checkTitle: { color: '#071A20', fontWeight: '700' },
  checkSub: { color: '#687A82', fontWeight: '500', marginTop: 2 },
  statusPill: { backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: C.danger, fontWeight: '700' },
  statusOk: { backgroundColor: '#E4F6EE' },
  statusTextOk: { color: '#0F956D' },
  noteBox: { borderWidth: 1, borderColor: '#D6E0E4', position: 'relative' },
  input: {
    borderColor: 'transparent',
    borderWidth: 0,
    boxShadow: 'none',
    flex: 1,
    color: C.ink,
    outlineColor: 'transparent',
    outlineOffset: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
    padding: 0,
    paddingBottom: 18,
  } as unknown as TextStyle,
  counter: { position: 'absolute', color: '#6D7F87' },
  notice: { alignSelf: 'stretch', color: '#B34A46', fontWeight: '600', marginTop: 8, paddingHorizontal: 4 },
  submit: { backgroundColor: C.disabledBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  submitEnabled: { backgroundColor: '#17B48B' },
  submitText: { color: C.disabled, fontWeight: '700' },
  submitTextEnabled: { color: '#FFFFFF' },
})
