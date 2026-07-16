import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Ellipse, G, Image as SvgImage, Path, Rect } from 'react-native-svg'

export type KaelLottieSource = object | string | number

export const kaelLottieRendererKind: 'fallback' | 'native-lottie' | 'svg-lottie' = 'svg-lottie'

type KaelLottieViewProps = {
  autoPlay?: boolean
  loop?: boolean
  resizeMode?: 'cover' | 'contain' | 'center'
  source: KaelLottieSource
  speed?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

type LottieVector = number[]
type LottieKeyframe = {
  e?: LottieVector
  h?: number
  i?: LottieEaseHandle
  o?: LottieEaseHandle
  s: LottieVector
  t: number
}
type LottieEaseHandle = {
  x?: number[]
  y?: number[]
}
type LottieProperty = {
  a?: number
  k?: number | LottieVector | LottieKeyframe[] | LottieShapePath
}
type LottieShapePath = {
  c?: boolean
  i?: LottieVector[]
  o?: LottieVector[]
  v?: LottieVector[]
}
type LottieShape = {
  a?: LottieProperty
  c?: LottieProperty
  d?: number
  e?: LottieProperty
  it?: LottieShape[]
  k?: number | LottieVector
  ks?: LottieProperty
  lc?: number
  lj?: number
  m?: number
  ml?: number
  nm?: string
  o?: LottieProperty
  p?: LottieProperty
  r?: LottieProperty | number
  sa?: LottieProperty
  s?: LottieProperty
  sk?: LottieProperty
  ty: string
  w?: LottieProperty
}
type LottieLayer = {
  h?: number
  ip?: number
  ks?: {
    a?: LottieProperty
    o?: LottieProperty
    p?: LottieProperty
    r?: LottieProperty
    s?: LottieProperty
  }
  layers?: LottieLayer[]
  nm?: string
  op?: number
  refId?: string
  shapes?: LottieShape[]
  ty: number
  w?: number
}
type LottieAsset = {
  h?: number
  id?: string
  p?: string
  u?: string
  w?: number
}
type LottieAnimation = {
  assets?: LottieAsset[]
  fr?: number
  h?: number
  ip?: number
  layers?: LottieLayer[]
  op?: number
  w?: number
}

type RenderStyle = {
  fill?: string
  fillOpacity: number
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
  stroke?: string
  strokeDasharray?: number[]
  strokeDashoffset?: number
  strokeOpacity: number
  strokeWidth: number
}

const lottieNodeKeys = new WeakMap<object, string>()
let nextLottieNodeKey = 0

const DEFAULT_FRAME_RATE = 60
const APPROVED_LOGO_TRANSPARENT_SOURCE = require('@/assets/lottie/nestscout-aurora-nest-approved-logo-transparent.png') as ImageSourcePropType

export function KaelLottieView({
  autoPlay = true,
  loop = false,
  source,
  speed = 1,
  style,
  testID,
}: KaelLottieViewProps) {
  const animation = typeof source === 'object' && source ? source as LottieAnimation : null
  const frameRate = animation?.fr && animation.fr > 0 ? animation.fr : DEFAULT_FRAME_RATE
  const firstFrame = animation?.ip ?? 0
  const lastFrame = animation?.op ?? firstFrame
  const [frame, setFrame] = useState(firstFrame)

  useEffect(() => {
    if (!animation || !autoPlay || lastFrame <= firstFrame) {
      setFrame(firstFrame)
      return undefined
    }

    let animationFrame = 0
    const startedAt = Date.now()
    const durationFrames = lastFrame - firstFrame
    const tick = () => {
      const elapsedFrames = ((Date.now() - startedAt) / 1000) * frameRate * speed
      const nextFrame = loop
        ? firstFrame + (elapsedFrames % durationFrames)
        : Math.min(lastFrame, firstFrame + elapsedFrames)
      setFrame(nextFrame)
      if (loop || nextFrame < lastFrame) animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [animation, autoPlay, firstFrame, frameRate, lastFrame, loop, speed])

  const assetById = useMemo(() => {
    const assets = new Map<string, LottieAsset>()
    for (const asset of animation?.assets ?? []) {
      if (asset.id) assets.set(asset.id, asset)
    }
    return assets
  }, [animation])

  if (!animation?.w || !animation.h || !animation.layers) {
    return <View style={style} testID={testID} />
  }

  return (
    <View style={style} testID={testID}>
      <Svg height="100%" viewBox={`0 0 ${animation.w} ${animation.h}`} width="100%">
        {animation.layers.map((layer) => renderLayer(layer, frame, assetById, lottieNodeKey(layer, 'layer')))}
      </Svg>
    </View>
  )
}

function renderLayer(layer: LottieLayer, frame: number, assetById: Map<string, LottieAsset>, key: string) {
  if ((typeof layer.ip === 'number' && frame < layer.ip) || (typeof layer.op === 'number' && frame > layer.op)) return null

  const transform = layer.nm?.startsWith('Aurora Current') ? undefined : layerTransform(layer, frame)
  const opacity = animatedNumber(layer.ks?.o, frame, 100) / 100
  if (opacity <= 0.001) return null

  if (layer.ty === 2 && layer.refId) {
    const asset = assetById.get(layer.refId)
    if (!asset?.p || !asset.w || !asset.h) return null
    const imageSource = layer.nm?.includes('Approved Logo') ? APPROVED_LOGO_TRANSPARENT_SOURCE : asset.p

    return (
      <G key={key} opacity={opacity} transform={transform}>
        <SvgImage height={asset.h} href={imageSource} preserveAspectRatio="xMidYMid meet" width={asset.w} x={0} y={0} />
      </G>
    )
  }

  if (layer.ty === 4 && layer.shapes) {
    return (
      <G key={key} opacity={opacity} transform={transform}>
        <LottieShapes frame={frame} keyPrefix={key} layerName={layer.nm} shapes={layer.shapes} />
      </G>
    )
  }

  return null
}

function LottieShapes({
  frame,
  keyPrefix,
  layerName,
  shapes,
}: {
  frame: number
  keyPrefix: string
  layerName?: string
  shapes: LottieShape[]
}) {
  const shapeTransform = shapes.find((shape) => shape.ty === 'tr')
  const rendered: ReactNode[] = []

  shapes.forEach((shape, index) => {
    const shapeKey = lottieNodeKey(shape, shape.ty)
    if (shape.ty === 'gr' && shape.it) {
      rendered.push(
        <G key={`${keyPrefix}-group-${shapeKey}`}>
          <LottieShapes
            frame={frame}
            keyPrefix={`${keyPrefix}-group-${shapeKey}`}
            layerName={layerName}
            shapes={shape.it}
          />
        </G>,
      )
      return
    }

    if (shape.ty === 'fl' || shape.ty === 'st' || shape.ty === 'tm' || shape.ty === 'tr') return

    const style = drawableStyle(shapes, index, frame)
    const commonProps = {
      fill: style.fill ?? 'none',
      fillOpacity: style.fill ? style.fillOpacity : 0,
      strokeLinecap: style.lineCap,
      strokeLinejoin: style.lineJoin,
      stroke: style.stroke ?? 'none',
      strokeDasharray: style.strokeDasharray,
      strokeDashoffset: style.strokeDashoffset,
      strokeOpacity: style.stroke ? style.strokeOpacity : 0,
      strokeWidth: style.strokeWidth,
    }
    const glowProps = strokeGlowProps(layerName, style)

    if (shape.ty === 'el') {
      const [cx, cy] = vectorValue(shape.p, frame, [0, 0])
      const [width, height] = vectorValue(shape.s, frame, [0, 0])
      if (glowProps) {
        rendered.push(<Ellipse key={`${keyPrefix}-ellipse-glow-${shapeKey}`} cx={cx} cy={cy} rx={width / 2} ry={height / 2} {...glowProps} />)
      }
      rendered.push(<Ellipse key={`${keyPrefix}-ellipse-${shapeKey}`} cx={cx} cy={cy} rx={width / 2} ry={height / 2} {...commonProps} />)
      return
    }

    if (shape.ty === 'rc') {
      const [cx, cy] = vectorValue(shape.p, frame, [0, 0])
      const [width, height] = vectorValue(shape.s, frame, [0, 0])
      const radius = typeof shape.r === 'number' ? shape.r : animatedNumber(shape.r, frame, 0)
      if (glowProps) {
        rendered.push(
          <Rect
            key={`${keyPrefix}-rect-glow-${shapeKey}`}
            height={height}
            rx={radius}
            ry={radius}
            width={width}
            x={cx - width / 2}
            y={cy - height / 2}
            {...glowProps}
          />,
        )
      }
      rendered.push(
        <Rect
          key={`${keyPrefix}-rect-${shapeKey}`}
          height={height}
          rx={radius}
          ry={radius}
          width={width}
          x={cx - width / 2}
          y={cy - height / 2}
          {...commonProps}
        />,
      )
      return
    }

    if (shape.ty === 'sh') {
      const shapePath = shapePathValue(shape.ks)
      const path = shapePath ? pathValue(shapePath) : null
      if (path) {
        if (glowProps) rendered.push(<Path key={`${keyPrefix}-path-glow-${shapeKey}`} d={path} {...glowProps} />)
        rendered.push(<Path key={`${keyPrefix}-path-${shapeKey}`} d={path} {...commonProps} />)
      }
    }
  })

  if (!shapeTransform) return rendered

  const opacity = animatedNumber(shapeTransform.o, frame, 100) / 100
  return (
    <G key={`${keyPrefix}-transform`} opacity={opacity} transform={shapeTransformValue(shapeTransform, frame)}>
      {rendered}
    </G>
  )
}

function lottieNodeKey(node: object, prefix: string) {
  const current = lottieNodeKeys.get(node)
  if (current) return current
  nextLottieNodeKey += 1
  const key = `${prefix}-${nextLottieNodeKey}`
  lottieNodeKeys.set(node, key)
  return key
}

function strokeGlowProps(layerName: string | undefined, style: RenderStyle) {
  if (!style.stroke || style.strokeOpacity <= 0.001 || style.strokeWidth <= 0) return null

  const isCurrent = layerName?.startsWith('Aurora Current')
  const isAura = layerName?.startsWith('Aura Ring')
  const isNorthStar = layerName?.includes('North Star')
  const isPulse = layerName?.includes('Pulse')
  const isCaustic = layerName?.includes('Caustic')
  const opacityScale = isCurrent ? 0.22 : isAura ? 0.44 : isNorthStar ? 0.42 : isPulse ? 0.34 : isCaustic ? 0.38 : 0.28
  const widthScale = isCurrent ? 2.1 : isCaustic ? 2.4 : 2.8
  const opacity = Math.min(style.strokeOpacity * opacityScale, isCurrent ? 0.22 : 0.36)

  if (opacity <= 0.001) return null

  return {
    fill: 'none',
    stroke: style.stroke,
    strokeDasharray: style.strokeDasharray,
    strokeDashoffset: style.strokeDashoffset,
    strokeLinecap: style.lineCap,
    strokeLinejoin: style.lineJoin,
    strokeOpacity: opacity,
    strokeWidth: Math.max(style.strokeWidth * widthScale, style.strokeWidth + 4),
  }
}

function drawableStyle(shapes: LottieShape[], drawableIndex: number, frame: number): RenderStyle {
  const style: RenderStyle = { fillOpacity: 0, strokeOpacity: 0, strokeWidth: 1 }

  for (let index = drawableIndex + 1; index < shapes.length; index += 1) {
    const shape = shapes[index]
    if (shape.ty === 'el' || shape.ty === 'rc' || shape.ty === 'sh' || shape.ty === 'gr') break

    if (shape.ty === 'fl') {
      style.fill = colorValue(shape.c, frame)
      style.fillOpacity = animatedNumber(shape.o, frame, 100) / 100
    }

    if (shape.ty === 'st') {
      style.stroke = colorValue(shape.c, frame)
      style.strokeOpacity = animatedNumber(shape.o, frame, 100) / 100
      style.strokeWidth = animatedNumber(shape.w, frame, 1)
      style.lineCap = lineCapValue(shape.lc)
      style.lineJoin = lineJoinValue(shape.lj)
    }

    if (shape.ty === 'tm') {
      const trimStart = animatedNumber(shape.s, frame, 0)
      const trimEnd = animatedNumber(shape.e, frame, 100)
      const trimOffset = animatedNumber(shape.o, frame, 0)
      const drawable = shapes[drawableIndex]
      const shapePath = drawable.ty === 'sh' ? shapePathValue(drawable.ks) : null
      const length = shapePath ? shapePathLength(shapePath) : 0
      const visible = clamp(trimEnd - trimStart, 0, 100)

      if (length > 0 && visible < 99.9) {
        style.strokeDasharray = [length * (visible / 100), length]
        style.strokeDashoffset = -length * ((trimStart + trimOffset) / 100)
      }
    }
  }

  return style
}

function shapeTransformValue(shape: LottieShape, frame: number) {
  const position = vectorValue(shape.p, frame, [0, 0])
  const anchor = vectorValue(shape.a, frame, [0, 0])
  const scale = vectorValue(shape.s, frame, [100, 100])
  const rotation = animatedNumber(shape.r, frame, 0)
  return [
    `translate(${position[0] ?? 0} ${position[1] ?? 0})`,
    `rotate(${rotation})`,
    `scale(${(scale[0] ?? 100) / 100} ${(scale[1] ?? 100) / 100})`,
    `translate(${-(anchor[0] ?? 0)} ${-(anchor[1] ?? 0)})`,
  ].join(' ')
}

function lineCapValue(value: number | undefined): RenderStyle['lineCap'] {
  if (value === 2) return 'round'
  if (value === 3) return 'square'
  return 'butt'
}

function lineJoinValue(value: number | undefined): RenderStyle['lineJoin'] {
  if (value === 2) return 'round'
  if (value === 3) return 'bevel'
  return 'miter'
}

function layerTransform(layer: LottieLayer, frame: number) {
  const position = vectorValue(layer.ks?.p, frame, [0, 0, 0])
  const anchor = vectorValue(layer.ks?.a, frame, [0, 0, 0])
  const scale = vectorValue(layer.ks?.s, frame, [100, 100, 100])
  const rotation = animatedNumber(layer.ks?.r, frame, 0)
  return [
    `translate(${position[0] ?? 0} ${position[1] ?? 0})`,
    `rotate(${rotation})`,
    `scale(${(scale[0] ?? 100) / 100} ${(scale[1] ?? 100) / 100})`,
    `translate(${-(anchor[0] ?? 0)} ${-(anchor[1] ?? 0)})`,
  ].join(' ')
}

function animatedNumber(property: LottieProperty | number | undefined, frame: number, fallback: number) {
  if (typeof property === 'number') return property
  const value = vectorValue(property, frame, [fallback])
  return value[0] ?? fallback
}

function vectorValue(property: LottieProperty | undefined, frame: number, fallback: LottieVector): LottieVector {
  if (!property || property.k === undefined) return fallback
  if (typeof property.k === 'number') return [property.k]
  if (Array.isArray(property.k) && isKeyframeList(property.k)) return interpolateKeyframes(property.k, frame)
  if (Array.isArray(property.k)) return property.k as LottieVector
  return fallback
}

function colorValue(property: LottieProperty | undefined, frame: number) {
  const [r = 0, g = 0, b = 0, a = 1] = vectorValue(property, frame, [0, 0, 0, 1])
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
}

function isKeyframeList(value: (number | LottieKeyframe)[]): value is LottieKeyframe[] {
  return typeof value[0] === 'object'
}

function interpolateKeyframes(keyframes: LottieKeyframe[], frame: number) {
  if (keyframes.length === 0) return [0]

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index]
    const next = keyframes[index + 1]
    const endFrame = next.t
    if (frame >= current.t && frame <= endFrame) {
      const start = current.s
      const end = current.e ?? next.s ?? start
      const progress = endFrame === current.t ? 1 : clamp((frame - current.t) / (endFrame - current.t), 0, 1)
      if (current.h === 1) return start
      return start.map((startValue, valueIndex) => {
        const eased = keyframeProgress(current, next, progress, valueIndex)
        return startValue + ((end[valueIndex] ?? startValue) - startValue) * eased
      })
    }
  }

  return keyframes[frame < keyframes[0].t ? 0 : keyframes.length - 1].s
}

function keyframeProgress(current: LottieKeyframe, next: LottieKeyframe, progress: number, valueIndex: number) {
  const x1 = current.o?.x?.[valueIndex] ?? current.o?.x?.[0]
  const y1 = current.o?.y?.[valueIndex] ?? current.o?.y?.[0]
  const x2 = next.i?.x?.[valueIndex] ?? next.i?.x?.[0] ?? current.i?.x?.[valueIndex] ?? current.i?.x?.[0]
  const y2 = next.i?.y?.[valueIndex] ?? next.i?.y?.[0] ?? current.i?.y?.[valueIndex] ?? current.i?.y?.[0]

  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return progress
  return cubicBezierProgress(progress, x1, y1, x2, y2)
}

function cubicBezierProgress(progress: number, x1: number, y1: number, x2: number, y2: number) {
  let t = progress
  for (let index = 0; index < 6; index += 1) {
    const x = cubicBezierAxis(t, x1, x2) - progress
    const derivative = cubicBezierDerivative(t, x1, x2)
    if (Math.abs(x) < 0.0001 || Math.abs(derivative) < 0.0001) break
    t = clamp(t - x / derivative, 0, 1)
  }

  return clamp(cubicBezierAxis(t, y1, y2), 0, 1)
}

function cubicBezierAxis(t: number, c1: number, c2: number) {
  const mt = 1 - t
  return 3 * mt * mt * t * c1 + 3 * mt * t * t * c2 + t * t * t
}

function cubicBezierDerivative(t: number, c1: number, c2: number) {
  const mt = 1 - t
  return 3 * mt * mt * c1 + 6 * mt * t * (c2 - c1) + 3 * t * t * (1 - c2)
}

function shapePathValue(property: LottieProperty | undefined) {
  const shape = property?.k
  if (!shape || typeof shape === 'number' || Array.isArray(shape) || !shape.v) return null
  return shape
}

function pathValue(shape: LottieShapePath) {
  const vertices = shape.v
  if (!vertices || vertices.length === 0) return null

  const commands = [`M ${vertices[0][0]} ${vertices[0][1]}`]
  for (let index = 1; index < vertices.length; index += 1) {
    const previous = vertices[index - 1]
    const current = vertices[index]
    const previousOut = shape.o?.[index - 1] ?? [0, 0]
    const currentIn = shape.i?.[index] ?? [0, 0]
    if (isZero(previousOut) && isZero(currentIn)) {
      commands.push(`L ${current[0]} ${current[1]}`)
    } else {
      commands.push(`C ${previous[0] + previousOut[0]} ${previous[1] + previousOut[1]} ${current[0] + currentIn[0]} ${current[1] + currentIn[1]} ${current[0]} ${current[1]}`)
    }
  }

  if (shape.c) commands.push('Z')
  return commands.join(' ')
}

function shapePathLength(shape: LottieShapePath) {
  const vertices = shape.v
  if (!vertices || vertices.length < 2) return 0

  let length = 0
  for (let index = 1; index < vertices.length; index += 1) {
    length += segmentLength(vertices[index - 1], vertices[index], shape.o?.[index - 1] ?? [0, 0], shape.i?.[index] ?? [0, 0])
  }

  if (shape.c) {
    length += segmentLength(vertices[vertices.length - 1], vertices[0], shape.o?.[vertices.length - 1] ?? [0, 0], shape.i?.[0] ?? [0, 0])
  }

  return length
}

function segmentLength(start: LottieVector, end: LottieVector, out: LottieVector, incoming: LottieVector) {
  if (isZero(out) && isZero(incoming)) return distance(start, end)

  let length = 0
  let previous = start
  const controlA = [start[0] + (out[0] ?? 0), start[1] + (out[1] ?? 0)]
  const controlB = [end[0] + (incoming[0] ?? 0), end[1] + (incoming[1] ?? 0)]

  for (let index = 1; index <= 16; index += 1) {
    const t = index / 16
    const point = cubicPoint(start, controlA, controlB, end, t)
    length += distance(previous, point)
    previous = point
  }

  return length
}

function cubicPoint(start: LottieVector, controlA: LottieVector, controlB: LottieVector, end: LottieVector, t: number): LottieVector {
  const mt = 1 - t
  return [
    (mt ** 3) * (start[0] ?? 0) + 3 * (mt ** 2) * t * (controlA[0] ?? 0) + 3 * mt * (t ** 2) * (controlB[0] ?? 0) + (t ** 3) * (end[0] ?? 0),
    (mt ** 3) * (start[1] ?? 0) + 3 * (mt ** 2) * t * (controlA[1] ?? 0) + 3 * mt * (t ** 2) * (controlB[1] ?? 0) + (t ** 3) * (end[1] ?? 0),
  ]
}

function distance(start: LottieVector, end: LottieVector) {
  return Math.hypot((end[0] ?? 0) - (start[0] ?? 0), (end[1] ?? 0) - (start[1] ?? 0))
}

function isZero(vector: LottieVector) {
  return Math.abs(vector[0] ?? 0) < 0.001 && Math.abs(vector[1] ?? 0) < 0.001
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
