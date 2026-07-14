import { withRepeat, withSequence, withTiming } from 'react-native-reanimated'

import {
  KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS,
  KAEL_CORE_V9_AUTOPLAY_REPEAT_COUNT,
} from './kael-core-v9-contract'

type NumericSharedValue = { value: number }
type NumericFrame = readonly [offset: number, value: number]
type NumericTrack = readonly [NumericFrame, NumericFrame, ...NumericFrame[]]

type KaelCoreV9AutoplayChannels = {
  leftEyeScaleX: NumericSharedValue
  leftEyeScaleY: NumericSharedValue
  leftEyeX: NumericSharedValue
  leftEyeY: NumericSharedValue
  lensGlintOpacity: NumericSharedValue
  monocleRotation: NumericSharedValue
  rightEyeScaleX: NumericSharedValue
  rightEyeScaleY: NumericSharedValue
  rightEyeX: NumericSharedValue
  rightEyeY: NumericSharedValue
  shellPitch: NumericSharedValue
  shellRoll: NumericSharedValue
  shellScaleX: NumericSharedValue
  shellScaleY: NumericSharedValue
  shellX: NumericSharedValue
  shellY: NumericSharedValue
}

const BODY_OFFSETS = [0, 0.08, 0.22, 0.36, 0.5, 0.63, 0.72, 0.82, 0.91, 1] as const
const LEFT_EYE_OFFSETS = [0, 0.09, 0.14, 0.21, 0.41, 0.54, 0.63, 0.72, 0.82, 0.91, 1] as const
const RIGHT_EYE_OFFSETS = [0, 0.1, 0.15, 0.23, 0.42, 0.56, 0.65, 0.73, 0.83, 0.92, 1] as const
const MONOCLE_OFFSETS = [0, 0.23, 0.39, 0.64, 0.74, 0.82, 0.92, 1] as const
const GLINT_OFFSETS = [0, 0.27, 0.33, 0.4, 0.61, 0.67, 0.75, 1] as const

function frames(offsets: readonly number[], values: readonly number[]): NumericTrack {
  if (offsets.length < 2 || offsets.length !== values.length) {
    throw new Error('Invalid Kael v11 autoplay track')
  }
  return offsets.map((offset, index) => [offset, values[index] ?? 0] as const) as unknown as NumericTrack
}

const TRACKS = {
  shellX: frames(BODY_OFFSETS, [0, 0, -5.7, -6.4, -1.45, 4.6, 3.8, 0.2, 0, 0]),
  shellY: frames(BODY_OFFSETS, [0, 0, -2, -1.7, -0.6, -2.35, -1.75, 2.3, -0.78, 0]),
  shellRoll: frames(BODY_OFFSETS, [0, 0, -3.4, -2.7, -0.4, 2.8, 1.9, 0, -0.6, 0]),
  shellPitch: frames(BODY_OFFSETS, [0, 0, -1, -0.4, 0, -1, -0.4, 7, -0.6, 0]),
  shellScaleX: frames(BODY_OFFSETS, [1, 1, 1.035, 1.03, 1.012, 1.045, 1.034, 0.994, 1.012, 1]),
  shellScaleY: frames(BODY_OFFSETS, [1, 1, 1.035, 1.03, 1.012, 1.045, 1.034, 0.955, 1.012, 1]),
  leftEyeX: frames(LEFT_EYE_OFFSETS, [0, 0, 0, -1.55, -1.55, -0.18, 0.28, 0.1, 0, 0, 0]),
  leftEyeY: frames(LEFT_EYE_OFFSETS, [0, 0.18, 0, -0.2, -0.2, -0.08, -0.38, -0.2, 1.32, -0.16, 0]),
  leftEyeScaleX: frames(LEFT_EYE_OFFSETS, [1, 1, 1, 1.03, 1.03, 1.01, 1.08, 1.05, 1, 1.04, 1]),
  leftEyeScaleY: frames(LEFT_EYE_OFFSETS, [1, 0.22, 1, 1.04, 1.04, 1.02, 1.13, 1.08, 0.58, 1.08, 1]),
  rightEyeX: frames(RIGHT_EYE_OFFSETS, [0, 0, 0, -1.32, -1.32, 0.14, -0.22, -0.08, 0, 0, 0]),
  rightEyeY: frames(RIGHT_EYE_OFFSETS, [0, 0.18, 0, -0.18, -0.18, -0.08, -0.38, -0.2, 1.32, -0.16, 0]),
  rightEyeScaleX: frames(RIGHT_EYE_OFFSETS, [1, 1, 1, 1.03, 1.03, 1.01, 1.08, 1.05, 1, 1.04, 1]),
  rightEyeScaleY: frames(RIGHT_EYE_OFFSETS, [1, 0.22, 1, 1.04, 1.04, 1.02, 1.13, 1.08, 0.58, 1.08, 1]),
  monocleRotation: frames(MONOCLE_OFFSETS, [0, -3.4, 1.2, 4, -1.8, 5.8, -0.8, 0]),
  lensGlintOpacity: frames(GLINT_OFFSETS, [0.08, 0.08, 0.88, 0.1, 0.1, 0.98, 0.08, 0.08]),
} as const

function trackAnimation(track: NumericTrack, repeatCount: number, valueScale = 1) {
  const segments = track.slice(1).map(([offset, value], index) => withTiming(value * valueScale, {
    duration: Math.round(KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS * (offset - track[index]![0])),
  }))
  return withRepeat(withSequence(segments[0]!, ...segments.slice(1)), repeatCount, false)
}

export function startKaelCoreV9Autoplay(
  channels: KaelCoreV9AutoplayChannels,
  { motionScale, repeat }: { motionScale: number; repeat: boolean },
) {
  const repeatCount = repeat ? KAEL_CORE_V9_AUTOPLAY_REPEAT_COUNT : 1
  channels.shellX.value = trackAnimation(TRACKS.shellX, repeatCount, motionScale)
  channels.shellY.value = trackAnimation(TRACKS.shellY, repeatCount, motionScale)
  channels.shellRoll.value = trackAnimation(TRACKS.shellRoll, repeatCount)
  channels.shellPitch.value = trackAnimation(TRACKS.shellPitch, repeatCount)
  channels.shellScaleX.value = trackAnimation(TRACKS.shellScaleX, repeatCount)
  channels.shellScaleY.value = trackAnimation(TRACKS.shellScaleY, repeatCount)
  channels.leftEyeX.value = trackAnimation(TRACKS.leftEyeX, repeatCount, motionScale)
  channels.leftEyeY.value = trackAnimation(TRACKS.leftEyeY, repeatCount, motionScale)
  channels.leftEyeScaleX.value = trackAnimation(TRACKS.leftEyeScaleX, repeatCount)
  channels.leftEyeScaleY.value = trackAnimation(TRACKS.leftEyeScaleY, repeatCount)
  channels.rightEyeX.value = trackAnimation(TRACKS.rightEyeX, repeatCount, motionScale)
  channels.rightEyeY.value = trackAnimation(TRACKS.rightEyeY, repeatCount, motionScale)
  channels.rightEyeScaleX.value = trackAnimation(TRACKS.rightEyeScaleX, repeatCount)
  channels.rightEyeScaleY.value = trackAnimation(TRACKS.rightEyeScaleY, repeatCount)
  channels.monocleRotation.value = trackAnimation(TRACKS.monocleRotation, repeatCount)
  channels.lensGlintOpacity.value = trackAnimation(TRACKS.lensGlintOpacity, repeatCount)
}
