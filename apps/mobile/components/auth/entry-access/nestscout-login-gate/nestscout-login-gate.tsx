import { Image } from 'expo-image'
import { useCallback, useState } from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ASSETS, DESIGN, type AssetKey, type CardSpec, type TextSpec } from './design'
import { getGateLayout, type GateMode, type Insets, type Role } from './layout'

export type { Role } from './layout'
export type TextMode = 'reference' | 'native'
export type CopyKey = TextSpec['id']
export type GateCopy = Partial<Record<CopyKey, string>>

export type NestScoutLoginGateProps = {
  onRolePress: (role: Role) => void
  selectedRole?: Role | null
  disabled?: boolean
  mode?: GateMode
  textMode?: TextMode
  copy?: GateCopy
  accessibilityHint?: string
  brandAccessibilityLabel?: string
  safeAreaInsets?: Insets
  maxContentWidth?: number
  style?: StyleProp<ViewStyle>
}

type Rect = readonly number[]
const EMPTY_COPY: GateCopy = {}
const ROOT_TEXTS = DESIGN.texts.filter(text => !('parent' in text))

function rectStyle(rect: Rect, scale: number, originX = 0, originY = 0): ViewStyle {
  return {
    position: 'absolute',
    left: (rect[0] - originX) * scale,
    top: (rect[1] - originY) * scale,
    width: rect[2] * scale,
    height: rect[3] * scale,
  }
}

function selectionOverlayStyle(scale: number, selected: boolean, pressed: boolean, disabled: boolean): ViewStyle {
  return {
    position: 'absolute',
    left: 3 * scale,
    top: 3 * scale,
    right: 3 * scale,
    bottom: 3 * scale,
    borderRadius: 78 * scale,
    borderCurve: 'continuous',
    borderWidth: selected ? 3 * scale : 0,
    borderColor: '#118C7D',
    backgroundColor: disabled
      ? 'rgba(255,255,255,0.35)'
      : pressed
        ? 'rgba(4,60,52,0.06)'
        : 'transparent',
  }
}

function Asset({ name }: { name: AssetKey }) {
  return (
    <Image
      source={ASSETS[name]}
      accessible={false}
      pointerEvents="none"
      contentFit="fill"
      transition={0}
      cachePolicy="memory"
      priority="high"
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}
    />
  )
}

// The backdrop is a fixed-ratio crop, so a taller viewport leaves bands above and below it.
// Each band repeats the backdrop's outermost rows stretched to the band height, so the
// artwork reads as one continuous surface instead of a stage floating on a flat fill.
const EDGE_SOURCE_ROWS = 2

function BackdropEdge({
  edge,
  height,
  width,
  scale,
  stageHeight,
  name,
}: {
  edge: 'top' | 'bottom'
  height: number
  width: number
  scale: number
  stageHeight: number
  name: AssetKey
}) {
  if (height <= 0) return null
  const stretchedHeight = stageHeight * (height / (EDGE_SOURCE_ROWS * scale))

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, overflow: 'hidden' }}
      testID={`auth-role-gate-backdrop-edge-${edge}`}
    >
      <Image
        source={ASSETS[name]}
        accessible={false}
        contentFit="fill"
        transition={0}
        cachePolicy="memory"
        style={{
          position: 'absolute',
          left: 0,
          width,
          height: stretchedHeight,
          ...(edge === 'top' ? { top: 0 } : { bottom: 0 }),
        }}
      />
    </View>
  )
}

function BrandMark({
  scale,
  originX,
  originY,
  accessibilityLabel,
}: {
  scale: number
  originX: number
  originY: number
  accessibilityLabel: string
}) {
  const mask = DESIGN.brand.taglineMask

  return (
    <View
      style={rectStyle(DESIGN.brand.rect, scale, originX, originY)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="auth-role-gate-brand"
    >
      <Asset name="brand" />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: mask[0] * scale,
          top: mask[1] * scale,
          width: mask[2] * scale,
          height: mask[3] * scale,
          backgroundColor: '#FBFEFE',
        }}
        testID="auth-role-gate-brand-tagline-mask"
      />
    </View>
  )
}

function Caption({
  spec,
  value,
  mode,
  scale,
  originX = 0,
  originY = 0,
  hidden = false,
}: {
  spec: TextSpec
  value: string
  mode: TextMode
  scale: number
  originX?: number
  originY?: number
  hidden?: boolean
}) {
  const exact = mode === 'reference' && value === spec.text
  const textStyle: TextStyle = {
    color: spec.color,
    fontSize: spec.fontSize * scale,
    fontWeight: spec.fontWeight,
    lineHeight: spec.lineHeight * scale,
    letterSpacing: spec.letterSpacing * scale,
    textAlign: spec.align,
    includeFontPadding: false,
  }

  return (
    <View
      pointerEvents="none"
      style={rectStyle(spec.rect, scale, originX, originY)}
      accessible={!hidden}
      accessibilityLabel={value.replace(/\n/g, ' ')}
      accessibilityRole={spec.role === 'heading' ? 'header' : 'text'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Asset name={(exact ? spec.id : `${spec.id}-clean`) as AssetKey} />
      {!exact && (
        <Text accessible={false} allowFontScaling style={textStyle}>
          {value}
        </Text>
      )}
    </View>
  )
}

function RoleCard({
  card,
  scale,
  originX,
  originY,
  textMode,
  copy,
  selected,
  disabled,
  hint,
  onPress,
}: {
  card: CardSpec
  scale: number
  originX: number
  originY: number
  textMode: TextMode
  copy: GateCopy
  selected: boolean
  disabled: boolean
  hint: string
  onPress: (role: Role) => void
}) {
  const title = copy[`${card.id}-title`] ?? card.label
  const description = copy[`${card.id}-description`] ?? card.description
  const captions = DESIGN.texts.filter(text => 'parent' in text && text.parent === card.id)

  return (
    <Pressable
      testID={card.testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description.replace(/\n/g, ' ')}`}
      accessibilityHint={hint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => onPress(card.id)}
      style={rectStyle(card.rect, scale, originX, originY)}
    >
      {({ pressed }) => (
        <>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', width: '100%', height: '100%' }}
          >
            <Asset name={`${card.id}-surface`} />
            {captions.map(text => (
              <Caption
                key={text.id}
                spec={text}
                value={copy[text.id] ?? text.text}
                mode={textMode}
                scale={scale}
                originX={card.rect[0]}
                originY={card.rect[1]}
                hidden
              />
            ))}
            <View style={rectStyle(card.arrow, scale, card.rect[0], card.rect[1])}>
              <Asset name={`${card.id}-arrow`} />
            </View>
          </View>
          {(selected || pressed || disabled) && (
            <View
              pointerEvents="none"
              style={selectionOverlayStyle(scale, selected, pressed, disabled)}
            />
          )}
        </>
      )}
    </Pressable>
  )
}

export function NestScoutLoginGate({
  onRolePress,
  selectedRole = null,
  disabled = false,
  mode = 'app',
  textMode = 'reference',
  copy = EMPTY_COPY,
  accessibilityHint = 'Chạm để tiếp tục với vai trò này.',
  brandAccessibilityLabel = DESIGN.brand.label,
  safeAreaInsets,
  maxContentWidth = 480,
  style,
}: NestScoutLoginGateProps) {
  const window = useWindowDimensions()
  const systemInsets = useSafeAreaInsets()
  const [viewport, setViewport] = useState({ width: window.width, height: window.height })
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (width > 0 && height > 0) {
      setViewport(previous => (
        Math.abs(previous.width - width) < 0.01 && Math.abs(previous.height - height) < 0.01
          ? previous
          : { width, height }
      ))
    }
  }, [])
  const layout = getGateLayout(
    viewport.width,
    viewport.height,
    mode,
    safeAreaInsets ?? systemInsets,
    maxContentWidth,
  )
  const { scale, originX, originY, stageWidth, stageHeight, safe } = layout
  const backdrop: AssetKey = mode === 'reference' ? 'reference-backdrop' : 'app-backdrop'
  const topBand = safe.top + layout.extraTop
  const bottomBand = Math.max(safe.bottom, viewport.height - topBand - stageHeight)

  return (
    <View
      onLayout={onLayout}
      testID="auth-role-gate-content"
      style={[{ flex: 1, backgroundColor: '#F5FCFA' }, style]}
    >
      <ScrollView
        showsVerticalScrollIndicator={layout.scrollNeeded}
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{
          minHeight: viewport.height,
          paddingLeft: safe.left,
          paddingRight: safe.right,
          alignItems: 'center',
        }}
      >
        <BackdropEdge edge="top" height={topBand} width={stageWidth} scale={scale} stageHeight={stageHeight} name={backdrop} />
        <View style={{ width: stageWidth, height: stageHeight, position: 'relative', overflow: 'hidden' }}>
          <Asset name={backdrop} />
          <BrandMark
            accessibilityLabel={brandAccessibilityLabel}
            originX={originX}
            originY={originY}
            scale={scale}
          />
          {ROOT_TEXTS.map(text => (
            <Caption
              key={text.id}
              spec={text}
              value={copy[text.id] ?? text.text}
              mode={textMode}
              scale={scale}
              originX={originX}
              originY={originY}
            />
          ))}
          {DESIGN.cards.map(card => (
            <RoleCard
              key={card.id}
              card={card}
              scale={scale}
              originX={originX}
              originY={originY}
              textMode={textMode}
              copy={copy}
              selected={selectedRole === card.id}
              disabled={disabled}
              hint={accessibilityHint}
              onPress={onRolePress}
            />
          ))}
        </View>
        <BackdropEdge edge="bottom" height={bottomBand} width={stageWidth} scale={scale} stageHeight={stageHeight} name={backdrop} />
      </ScrollView>
    </View>
  )
}
