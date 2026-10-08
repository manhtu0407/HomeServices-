import { useId, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextProps,
  type TextStyle,
} from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

import { PrimaryCtaFill, primaryCtaFrame } from '@/components/ui/primary-cta-fill'
import type { AppleTypographyRole } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'

import { textByLanguage } from '../../ui/format'
import { STAGE_MAX_FONT_MULTIPLIER, STAGE_MIN_TAP_SIZE, stageTapSize, stageTypography } from '../stage-ratio'
import { stageSixAssets } from './stage-six-assets'
import { StageSixIcon, type StageSixIconName } from './stage-six-icons'
import { stageSixTokens as stageSixTokensLight } from './stage-six-tokens'
import { useWorkerThemedStyles, useWorkerThemedTokens } from '../../ui/worker-dark-styles'
import { FillSvg } from '@/components/ui/fill-svg'

const CLight = stageSixTokensLight.colors

type StageSixField = 'items' | 'reason' | 'evidence' | 'price'

const LAYOUT = {
  compact: {
    attachment: { gap: 8, iconHeight: 42, iconWidth: 34, minHeight: 62, paddingH: 12, paddingV: 8, plus: 34, plusRadius: 10, radius: 16, thumb: 38, thumbOverlap: 14, thumbRadius: 9 },
    button: { gap: 10, height: 54, pairGap: 10, radius: 18 },
    card: { marginLeft: 10, marginRight: 10, paddingBottom: 12, paddingH: 12, paddingTop: 15, radius: 23 },
    connector: { bottom: 27, left: 14, top: -4, width: 2 },
    footer: { gap: 10, marginBottom: 16, marginLeft: 12, marginRight: 12, marginTop: 12 },
    glyph: { attachment: 23, check: 15, checkDisc: 22, edit: 17, hero: 27, node: 18, plus: 20, sparkle: 18 },
    header: { gap: 11, minHeight: 46 },
    hero: { height: 44, width: 42 },
    kael: { gap: 4, marginRight: 1 },
    node: { marginLeft: 1, marginRight: 0, size: 30 },
    row: { contentGap: 3, gap: 11, minHeight: 64, paddingV: 8 },
    timeline: { marginLeft: 0, marginRight: 105, marginTop: 13 },
    workart: { height: 122, right: 8, top: 124, width: 115 },
  },
  wide: {
    attachment: { gap: 8, iconHeight: 42, iconWidth: 34, minHeight: 62, paddingH: 12, paddingV: 8, plus: 34, plusRadius: 10, radius: 16, thumb: 38, thumbOverlap: 14, thumbRadius: 9 },
    button: { gap: 10, height: 54, pairGap: 8, primaryWidth: 168, radius: 18, secondaryWidth: 118 },
    card: { marginLeft: 10, marginRight: 0, paddingBottom: 9, paddingH: 10, paddingTop: 13, radius: 24 },
    connector: { bottom: 17, left: 15, top: -7, width: 2 },
    footer: { gap: 8, marginBottom: 17, marginLeft: 14, marginRight: 12, marginTop: 12 },
    glyph: { attachment: 23, check: 15, checkDisc: 22, edit: 17, hero: 29, node: 18, plus: 20, sparkle: 18 },
    header: { gap: 14, minHeight: 46 },
    hero: { height: 46, width: 46 },
    kael: { gap: 4, marginRight: 121 },
    labelWidth: 140,
    node: { marginLeft: 1, marginRight: 1, size: 30 },
    row: { contentGap: 18, gap: 18, minHeight: 37 },
    timeline: { marginLeft: 5, marginTop: 5, width: 344 },
    workart: { height: 189, right: 15, top: 23, width: 179 },
  },
} as const

const TYPE = {
  action: 'footnote',
  attachmentHint: 'caption2',
  attachmentTitle: 'caption1',
  eyebrow: 'caption2',
  kael: 'caption2',
  label: 'caption1',
  price: 'subheadline',
  title: 'callout',
  value: 'caption1',
} as const satisfies Record<string, AppleTypographyRole>

export type StageSixTimelineProps = {
  attachmentCount: number
  /** Real media refs or local URIs already attached; the tile previews the first three and never invents one. */
  attachmentPreviews?: readonly string[]
  busy: boolean
  /** Gates every draft path: the item and reason rows, the evidence row, the attachment tile, and Chỉnh sửa. */
  canEdit: boolean
  evidenceCount: number
  itemSummary: string | null | undefined
  language: AppLanguage
  onAddAttachment: () => void
  onAskKael: () => void
  onEdit: () => void
  onPrimary: () => void
  /** Already formatted by the workflow; this surface never prices work. */
  priceLabel: string | null | undefined
  primaryDisabled: boolean
  primaryLabel: string
  reason: string | null | undefined
  reduceMotion: boolean
}

function nonNegativeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function StageSixText(props: TextProps) {
  return <Text maxFontSizeMultiplier={STAGE_MAX_FONT_MULTIPLIER} {...props} />
}

function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
}

// SVG objectBoundingBox gradients skew with the box aspect ratio; these endpoints reproduce CSS `linear-gradient(<angle>)` exactly.
function cssGradientLine(angle: number, width: number, height: number) {
  const radians = (angle * Math.PI) / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  return { x1: width / 2 - dx * half, x2: width / 2 + dx * half, y1: height / 2 - dy * half, y2: height / 2 + dy * half }
}

const SECONDARY_STOPS = [['0%', CLight.secondaryStart], ['100%', CLight.secondaryEnd]] as const

function StageSixButtonBackground({ radius }: { radius: number }) {
  const stageSixTokens = useWorkerThemedTokens(stageSixTokensLight)
  const fillId = useSvgId('stage-six-button-fill')
  const [size, setSize] = useState<{ height: number; width: number } | null>(null)
  const line = size ? cssGradientLine(stageSixTokens.gradients.secondaryAngle, size.width, size.height) : null

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout
    if (width <= 0 || height <= 0) return
    setSize((previous) => (previous && Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5 ? previous : { height, width }))
  }

  return (
    <View onLayout={handleLayout} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {size && line ? (
        <Svg height={size.height} width={size.width}>
          <Defs>
            <LinearGradient gradientUnits="userSpaceOnUse" id={fillId} x1={line.x1} x2={line.x2} y1={line.y1} y2={line.y2}>
              {SECONDARY_STOPS.map(([offset, stopColor]) => <Stop key={offset} offset={offset} stopColor={stopColor} />)}
            </LinearGradient>
          </Defs>
          <Rect fill={`url(#${fillId})`} height={size.height} rx={radius} width={size.width} x={0} y={0} />
        </Svg>
      ) : null}
    </View>
  )
}

function StageSixConnectorFill() {
  const C = useWorkerThemedTokens(CLight)
  const gradientId = useSvgId('stage-six-connector')
  return (
    <FillSvg preserveAspectRatio="none" viewBox="0 0 2 100">
      <Defs>
        <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0%" stopColor={C.connectorStart} />
          <Stop offset="58%" stopColor={C.connectorMiddle} />
          <Stop offset="100%" stopColor={C.connectorEnd} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${gradientId})`} height={100} width={2} x={0} y={0} />
    </FillSvg>
  )
}

/**
 * Production Stage 6 Timeline Card. Presentational only: the host maps the real scope-change
 * workflow into these props, so no stage transition, price, or upload happens here.
 * Geometry scales with the device from the approved artboard; phone type follows the shared
 * stage-ratio contract (11pt floor, ramp, Dynamic Type capped at 1.3×) so copy never clips.
 * Under 520pt the approved layout stacks values under labels and moves the attachment tile above the buttons.
 */
export function StageSixTimeline({
  attachmentCount,
  attachmentPreviews = [],
  busy,
  canEdit,
  evidenceCount,
  itemSummary,
  language,
  onAddAttachment,
  onAskKael,
  onEdit,
  onPrimary,
  priceLabel,
  primaryDisabled,
  primaryLabel,
  reason,
  reduceMotion,
}: StageSixTimelineProps) {
  const stageSixTokens = useWorkerThemedTokens(stageSixTokensLight)
  const C = useWorkerThemedTokens(CLight)
  const styles = useWorkerThemedStyles(stylesLight)
  const previewUrls = useJobMediaPreviewUrls(attachmentPreviews.slice(0, 3))
  const { fontScale, width: windowWidth } = useWindowDimensions()
  const [width, setWidth] = useState(windowWidth)
  const compact = width < stageSixTokens.compactBreakpoint || fontScale > 1.15
  const variant = compact ? 'compact' : 'wide'
  const L = LAYOUT[variant]
  const scale = Math.min(stageSixTokens.scaleClamp.max, Math.max(stageSixTokens.scaleClamp.min, width / stageSixTokens.referenceWidth[variant]))
  const s = (value: number) => value * scale
  const glyph = (value: number) => s(value) * stageSixTokens.glyphScale
  const type = (role: AppleTypographyRole): TextStyle => stageTypography(role, windowWidth)
  const evidence = nonNegativeCount(evidenceCount)
  const attachments = nonNegativeCount(attachmentCount)
  const editLocked = busy || !canEdit
  const primaryLocked = busy || primaryDisabled
  const pressedStyle = reduceMotion ? styles.pressedStatic : styles.pressed
  const rowMinHeight = compact ? stageTapSize(L.row.minHeight, scale) : s(L.row.minHeight)
  const buttonMinHeight = stageTapSize(L.button.height, scale)
  const kaelHitSlop = Math.max(6, (STAGE_MIN_TAP_SIZE - s(L.glyph.sparkle)) / 2)
  const workartHeight = s(L.workart.height)
  // The workart caption is handwritten Vietnamese, so English mode keeps only the paper illustration.
  const workartFrameHeight = language === 'vi' ? workartHeight : Math.round(workartHeight * stageSixTokens.workartIllustrationRatio)
  const fields: readonly { icon: StageSixIconName; key: StageSixField; title: string; value: string }[] = [
    {
      icon: 'item',
      key: 'items',
      title: textByLanguage(language, 'Hạng mục bổ sung', 'Additional scope'),
      value: itemSummary?.trim() || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft'),
    },
    {
      icon: 'reason',
      key: 'reason',
      title: textByLanguage(language, 'Lý do', 'Reason'),
      value: reason?.trim() || textByLanguage(language, 'Chưa có lý do thật', 'No real reason'),
    },
    {
      icon: 'evidence',
      key: 'evidence',
      title: textByLanguage(language, 'Bằng chứng', 'Evidence'),
      value: evidence
        ? textByLanguage(language, `${evidence} ảnh đính kèm`, evidence === 1 ? '1 attached photo' : `${evidence} attached photos`)
        : textByLanguage(language, 'Chưa có ảnh', 'No photos'),
    },
    {
      icon: 'price',
      key: 'price',
      title: textByLanguage(language, 'Khoảng giá', 'Price range'),
      value: priceLabel?.trim() || textByLanguage(language, 'Chờ Kael tính giá', 'Waiting for Kael estimate'),
    },
  ]

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width
    if (next > 0) setWidth((previous) => (Math.abs(next - previous) > 0.5 ? next : previous))
  }

  const handleField = (field: StageSixField) => {
    if (field === 'price') return onAskKael()
    if (field === 'evidence') return onAddAttachment()
    onEdit()
  }

  return (
    <View onLayout={handleLayout} style={styles.root} testID="worker-v5-stage-six-timeline">
      <View
        style={[
          styles.card,
          {
            marginLeft: s(L.card.marginLeft),
            marginRight: s(L.card.marginRight),
            paddingBottom: s(L.card.paddingBottom),
            paddingHorizontal: s(L.card.paddingH),
            paddingTop: s(L.card.paddingTop),
          },
          compact
            ? { borderRadius: s(L.card.radius), borderRightWidth: 1 }
            : { borderBottomLeftRadius: s(L.card.radius), borderRightWidth: 0, borderTopLeftRadius: s(L.card.radius) },
        ]}
        testID="worker-v5-stage-six-proposal-card"
      >
        <View style={[styles.header, { gap: s(L.header.gap), minHeight: s(L.header.minHeight) }]}>
          <View style={[styles.glyphSlot, { height: s(L.hero.height), width: s(L.hero.width) }]} testID="worker-v5-stage-six-hero-icon">
            <StageSixIcon color={C.heroGlyph} name="clock" size={glyph(L.glyph.hero)} strokeWidth={1.9} />
          </View>
          <View style={styles.heading}>
            <StageSixText style={[styles.eyebrow, type(TYPE.eyebrow), { marginBottom: s(1) }]}>{textByLanguage(language, 'Đề xuất thay đổi', 'Change proposal')}</StageSixText>
            <StageSixText accessibilityRole="header" style={[styles.title, type(TYPE.title)]}>{textByLanguage(language, 'Phạm vi công việc', 'Work scope')}</StageSixText>
          </View>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Kael hỗ trợ soạn đề xuất', 'Kael helps draft the proposal')}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={{ bottom: kaelHitSlop, left: 6, right: 6, top: kaelHitSlop }}
            onPress={onAskKael}
            style={({ pressed }) => [styles.kael, { gap: s(L.kael.gap), marginRight: s(L.kael.marginRight) }, pressed && pressedStyle]}
            testID="worker-v5-stage-six-kael-action"
          >
            <StageSixIcon color={C.kael} name="sparkle" size={s(L.glyph.sparkle)} />
            <StageSixText numberOfLines={1} style={[styles.kaelText, type(TYPE.kael)]}>{textByLanguage(language, 'Kael hỗ trợ soạn', 'Kael drafts')}</StageSixText>
          </Pressable>
        </View>

        <View
          accessibilityLabel={textByLanguage(language, 'Hai tờ ghi chú và bút. Làm rõ để công việc minh bạch hơn nhé!', 'Two notes and a pen.')}
          accessibilityRole="image"
          accessible
          pointerEvents="none"
          style={[styles.workartFrame, { height: workartFrameHeight, right: s(L.workart.right), top: s(L.workart.top), width: s(L.workart.width) }]}
          testID="worker-v5-stage-six-workart"
        >
          <Image contentFit="contain" source={stageSixAssets.workart} style={{ height: workartHeight, width: s(L.workart.width) }} />
        </View>

        <View
          style={
            compact
              ? { marginLeft: s(LAYOUT.compact.timeline.marginLeft), marginRight: s(LAYOUT.compact.timeline.marginRight), marginTop: s(LAYOUT.compact.timeline.marginTop) }
              : { marginLeft: s(LAYOUT.wide.timeline.marginLeft), marginTop: s(LAYOUT.wide.timeline.marginTop), maxWidth: '100%', width: s(LAYOUT.wide.timeline.width) }
          }
        >
          <View pointerEvents="none" style={[styles.connector, { bottom: s(L.connector.bottom), left: s(L.connector.left), top: s(L.connector.top), width: s(L.connector.width) }]}>
            <StageSixConnectorFill />
          </View>
          {fields.map((field, index) => {
            const disabled = field.key === 'price' ? busy : editLocked
            return (
              <Pressable
                accessibilityLabel={`${field.title}: ${field.value}`}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                key={field.key}
                onPress={() => handleField(field.key)}
                style={({ pressed }) => [styles.row, { gap: s(L.row.gap), minHeight: rowMinHeight }, pressed && styles.rowPressed]}
                testID={`worker-v5-stage-six-row-${field.key}`}
              >
                <View
                  style={[
                    styles.node,
                    { borderRadius: s(L.node.size / 2), height: s(L.node.size), marginLeft: s(L.node.marginLeft), marginRight: s(L.node.marginRight), width: s(L.node.size) },
                  ]}
                  testID={`worker-v5-stage-six-node-${field.key}`}
                >
                  <StageSixIcon color={C.nodeGlyph} name={field.icon} size={glyph(L.glyph.node)} strokeWidth={1.9} />
                </View>
                <View
                  style={[
                    styles.rowContent,
                    compact
                      ? [styles.rowContentCompact, { gap: s(LAYOUT.compact.row.contentGap), paddingVertical: s(LAYOUT.compact.row.paddingV) }]
                      : { gap: s(LAYOUT.wide.row.contentGap) },
                    { minHeight: rowMinHeight },
                  ]}
                >
                  <StageSixText style={[styles.rowLabel, type(TYPE.label), !compact && { width: s(LAYOUT.wide.labelWidth) }]}>{field.title}</StageSixText>
                  <StageSixText style={[styles.rowValue, compact && styles.rowValueCompact, type(field.key === 'price' ? TYPE.price : TYPE.value), field.key === 'price' && styles.price]}>{field.value}</StageSixText>
                  {index < fields.length - 1 ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View
        style={[
          styles.footer,
          compact && styles.footerCompact,
          { gap: s(L.footer.gap), marginBottom: s(L.footer.marginBottom), marginLeft: s(L.footer.marginLeft), marginRight: s(L.footer.marginRight), marginTop: s(L.footer.marginTop) },
        ]}
      >
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Thêm file, ảnh nếu có', 'Add files or photos if any')}
          accessibilityRole="button"
          accessibilityState={{ disabled: editLocked }}
          disabled={editLocked}
          onPress={onAddAttachment}
          style={({ pressed }) => [
            styles.attachment,
            compact && styles.attachmentCompact,
            {
              borderRadius: s(L.attachment.radius),
              gap: s(L.attachment.gap),
              minHeight: s(L.attachment.minHeight),
              paddingHorizontal: s(L.attachment.paddingH),
              paddingVertical: s(L.attachment.paddingV),
            },
            pressed && pressedStyle,
          ]}
          testID="worker-v5-stage-six-attachment"
        >
          {previewUrls.length > 0 ? (
            <View style={styles.thumbRow} testID="worker-v5-stage-six-attachment-thumbs">
              {previewUrls.map((url, index) => (
                <View
                  key={attachmentPreviews[index]}
                  style={[
                    styles.thumb,
                    {
                      borderRadius: s(L.attachment.thumbRadius),
                      borderWidth: s(2),
                      height: s(L.attachment.thumb),
                      marginLeft: index === 0 ? 0 : -s(L.attachment.thumbOverlap),
                      width: s(L.attachment.thumb),
                      zIndex: previewUrls.length - index,
                    },
                  ]}
                  testID={`worker-v5-stage-six-attachment-thumb-${index}`}
                >
                  {url ? (
                    <Image contentFit="cover" source={{ uri: url }} style={styles.thumbImage} />
                  ) : (
                    <StageSixIcon color={C.attachmentGlyph} name="photos" size={s(L.attachment.thumb) * 0.5} />
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.glyphSlot, { height: s(L.attachment.iconHeight), width: s(L.attachment.iconWidth) }]} testID="worker-v5-stage-six-attachment-icon">
              <StageSixIcon color={C.attachmentGlyph} name="photos" size={glyph(L.glyph.attachment)} />
            </View>
          )}
          <View style={[styles.attachmentCopy, { gap: s(2) }]}>
            <StageSixText numberOfLines={1} style={[styles.attachmentTitle, type(TYPE.attachmentTitle)]}>
              {attachments ? textByLanguage(language, `${attachments} tệp đính kèm`, attachments === 1 ? '1 attachment' : `${attachments} attachments`) : textByLanguage(language, 'Chưa có', 'None')}
            </StageSixText>
            <StageSixText style={[styles.attachmentHint, type(TYPE.attachmentHint)]}>
              {attachments ? textByLanguage(language, 'Chọn lại file, ảnh', 'Choose files or photos again') : textByLanguage(language, 'Thêm file, ảnh (nếu có)', 'Add files or photos (optional)')}
            </StageSixText>
          </View>
          <View style={[styles.plus, { borderRadius: s(L.attachment.plusRadius), height: s(L.attachment.plus), width: s(L.attachment.plus) }]} testID="worker-v5-stage-six-attachment-plus">
            <StageSixIcon color={C.plusGlyph} name="plus" size={s(L.glyph.plus)} strokeWidth={2} />
          </View>
        </Pressable>

        <View style={[styles.buttonPair, compact && styles.buttonPairCompact, { gap: s(L.button.pairGap) }]}>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
            accessibilityRole="button"
            accessibilityState={{ disabled: editLocked }}
            disabled={editLocked}
            onPress={onEdit}
            style={({ pressed }) => [
              styles.action,
              { borderRadius: s(L.button.radius), gap: s(L.button.gap), minHeight: buttonMinHeight, paddingHorizontal: s(6) },
              styles.secondary,
              compact ? styles.flexSecondary : { width: s(LAYOUT.wide.button.secondaryWidth) },
              editLocked && styles.disabled,
              pressed && pressedStyle,
            ]}
            testID="worker-v5-stage-six-edit-action"
          >
            <StageSixButtonBackground radius={s(L.button.radius)} />
            <StageSixIcon color={C.secondaryInk} name="edit" size={s(L.glyph.edit)} />
            <StageSixText numberOfLines={1} style={[styles.actionText, styles.secondaryText, type(TYPE.action)]}>{textByLanguage(language, 'Chỉnh sửa', 'Edit')}</StageSixText>
          </Pressable>
          <Pressable
            accessibilityLabel={primaryLabel}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: primaryLocked }}
            disabled={primaryLocked}
            onPress={onPrimary}
            style={({ pressed }) => [
              styles.action,
              { borderRadius: s(L.button.radius), gap: s(L.button.gap), minHeight: buttonMinHeight, paddingHorizontal: s(6) },
              styles.primary,
              compact ? styles.flexPrimary : { width: s(LAYOUT.wide.button.primaryWidth) },
              primaryLocked && styles.disabled,
              pressed && pressedStyle,
            ]}
            testID="worker-v5-stage-six-primary-action"
          >
            <PrimaryCtaFill radius={s(L.button.radius)} />
            {busy ? (
              <ActivityIndicator color={C.white} size="small" testID="worker-v5-stage-six-primary-busy" />
            ) : (
              <View style={[styles.checkDisc, { borderRadius: s(L.glyph.checkDisc / 2), height: s(L.glyph.checkDisc), width: s(L.glyph.checkDisc) }]}>
                <StageSixIcon color={C.checkGlyph} name="check" size={s(L.glyph.check)} strokeWidth={2.3} />
              </View>
            )}
            <StageSixText numberOfLines={2} style={[styles.actionText, styles.primaryText, type(TYPE.action)]}>{primaryLabel}</StageSixText>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const stylesLight = StyleSheet.create({
  root: { marginHorizontal: -stageSixTokensLight.hostGutter },
  card: { backgroundColor: CLight.surface, borderColor: CLight.cardBorder, borderWidth: 1 },
  header: { alignItems: 'center', flexDirection: 'row', zIndex: 2 },
  glyphSlot: { alignItems: 'center', flexShrink: 0, justifyContent: 'center' },
  heading: { flex: 1, minWidth: 0 },
  eyebrow: { color: CLight.eyebrow, fontWeight: '500' },
  title: { color: CLight.ink, fontWeight: '700' },
  kael: { alignItems: 'center', flexDirection: 'row', flexShrink: 0 },
  kaelText: { color: CLight.kael, fontWeight: '500' },
  workartFrame: { overflow: 'hidden', position: 'absolute' },
  connector: { position: 'absolute' },
  row: { alignItems: 'center', flexDirection: 'row' },
  rowPressed: { opacity: 0.72 },
  // The card-coloured disc hides the connector behind each bare glyph, so the line reads as segments between icons.
  node: { alignItems: 'center', backgroundColor: CLight.surface, flexShrink: 0, justifyContent: 'center' },
  rowContent: { alignItems: 'center', flex: 1, flexDirection: 'row', minWidth: 0 },
  rowContentCompact: { alignItems: 'flex-start', flexDirection: 'column', justifyContent: 'center' },
  // Drawn out of flow like the reference's ::after hairline, so it never shifts the row's centered text.
  rowDivider: { backgroundColor: CLight.line, bottom: 0, height: 1, left: 0, position: 'absolute', right: 0 },
  rowLabel: { color: CLight.text, fontWeight: '400' },
  rowValue: { color: CLight.value, flex: 1, minWidth: 0 },
  rowValueCompact: { flex: 0 },
  price: { color: CLight.price, fontWeight: '600' },
  footer: { alignItems: 'center', flexDirection: 'row' },
  footerCompact: { alignItems: 'stretch', flexDirection: 'column' },
  attachment: {
    alignItems: 'center',
    backgroundColor: CLight.tile,
    borderColor: CLight.dashed,
    borderStyle: 'dashed',
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  attachmentCompact: { flex: 0 },
  thumbRow: { alignItems: 'center', flexDirection: 'row', flexShrink: 0 },
  thumb: { alignItems: 'center', backgroundColor: CLight.secondaryBase, borderColor: CLight.tile, justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { height: '100%', width: '100%' },
  attachmentCopy: { flex: 1, minWidth: 0 },
  attachmentTitle: { color: CLight.value, fontWeight: '600' },
  attachmentHint: { color: CLight.muted },
  plus: { alignItems: 'center', backgroundColor: CLight.tile, borderColor: CLight.plusBorder, borderWidth: 1, boxShadow: stageSixTokensLight.shadows.plus, justifyContent: 'center' },
  buttonPair: { alignItems: 'center', flexDirection: 'row' },
  buttonPairCompact: { width: '100%' },
  action: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  secondary: { backgroundColor: CLight.secondaryBase },
  primary: { backgroundColor: CLight.primaryBase, ...primaryCtaFrame },
  flexSecondary: { flex: 1, minWidth: 0 },
  flexPrimary: { flex: 1.3, minWidth: 0 },
  actionText: { color: CLight.white, fontWeight: '600' },
  secondaryText: { color: CLight.secondaryInk, flexShrink: 1 },
  primaryText: { flexShrink: 1, textAlign: 'center' },
  checkDisc: { alignItems: 'center', backgroundColor: CLight.checkDisc, boxShadow: stageSixTokensLight.shadows.checkDisc, justifyContent: 'center' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.982 }] },
  pressedStatic: { opacity: 0.88 },
  disabled: { opacity: 0.48 },
})
