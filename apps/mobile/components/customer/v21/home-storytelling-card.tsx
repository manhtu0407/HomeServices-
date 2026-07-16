import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Text as SvgText,
} from 'react-native-svg'

import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'

type HomeStorytellingCardProps = {
  language: AppLanguage
  reduceMotion: boolean
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type StoryStep = {
  icon: 'context' | 'decision' | 'inspect'
  label: string
}

type StorytellingCopy = {
  accessibilityLabel: string
  body: [string, string]
  steps: [StoryStep, StoryStep, StoryStep]
  title: [string, string]
}

const storytellingCopy = {
  vi: {
    accessibilityLabel: 'Kael luôn sẵn sàng hỗ trợ. Kael quan sát và gợi ý. Bạn luôn là người quyết định. Nhìn vấn đề. Hiểu ngữ cảnh. Bạn quyết định.',
    body: [
      'Kael quan sát và gợi ý.',
      'Bạn luôn là người quyết định.',
    ],
    steps: [
      { icon: 'inspect', label: 'Nhìn vấn đề' },
      { icon: 'context', label: 'Hiểu ngữ cảnh' },
      { icon: 'decision', label: 'Bạn quyết định' },
    ],
    title: ['Kael luôn', 'sẵn sàng hỗ trợ'],
  },
  en: {
    accessibilityLabel: 'Kael is always ready to help. Kael observes and suggests. You remain in control. See the issue. Read the context. You decide.',
    body: [
      'Kael observes and suggests.',
      'You remain in control.',
    ],
    steps: [
      { icon: 'inspect', label: 'See the issue' },
      { icon: 'context', label: 'Read the context' },
      { icon: 'decision', label: 'You decide' },
    ],
    title: ['Kael is always', 'ready to help'],
  },
} satisfies Record<AppLanguage, StorytellingCopy>

const storyStepGeometry = [
  { badgeX: 188, centerX: 265, labelX: 216, width: 218, x: 156 },
  { badgeX: 421, centerX: 508, labelX: 450, width: 240, x: 388 },
  { badgeX: 675, centerX: 762, labelX: 704, width: 240, x: 642 },
] as const

export const homeStorytellingMotionContract = {
  bars: { duration: 6800, originX: 1122, originY: 177, peakRotation: 5, peakTranslateY: -8, restRotation: 8 },
  list: { duration: 7200, originX: 1648, originY: 403, peakRotation: 10, peakTranslateY: 7, restRotation: 7 },
  orb: { duration: 5600, originX: 1367, originY: 389, peakRotation: 0.45, peakTranslateY: -9, restRotation: -0.3 },
  spark: { duration: 6200, originX: 1138, originY: 599, peakRotation: -1, peakTranslateY: -7, restRotation: -4 },
} as const

const AnimatedGroup = Animated.createAnimatedComponent(G)
const sourceMotionEasing = Easing.bezier(0.42, 0, 0.58, 1)

function sourceMotionCycle(duration: number) {
  return withSequence(
    withTiming(1, { duration: duration / 2, easing: sourceMotionEasing }),
    withTiming(0, { duration: duration / 2, easing: sourceMotionEasing }),
  )
}

function sourceMotionTransform(
  progress: number,
  motion: (typeof homeStorytellingMotionContract)[keyof typeof homeStorytellingMotionContract],
) {
  'worklet'

  const translateY = interpolate(progress, [0, 1], [0, motion.peakTranslateY])
  const rotation = interpolate(progress, [0, 1], [motion.restRotation, motion.peakRotation])
  return `translate(0 ${translateY}) rotate(${rotation} ${motion.originX} ${motion.originY})`
}

export function HomeStorytellingCard({
  language,
  reduceMotion,
  reduceTransparency,
  tokens,
}: HomeStorytellingCardProps) {
  const copy = storytellingCopy[language]
  const dark = tokens.mode === 'dark'
  const colors = {
    cardEnd: dark ? '#121B19' : '#E7F5F5',
    cardMiddle: dark ? '#17211F' : '#F4FBFB',
    cardStart: dark ? '#1B2523' : '#FFFFFF',
    glassEnd: dark ? '#1B2A27' : '#E4F8F6',
    glassStart: dark ? '#24332F' : '#FFFFFF',
    line: dark ? '#65CFC6' : '#5DD8D1',
    mint: dark ? '#3EBEB2' : '#42AAA8',
    muted: tokens.muted,
    pageEnd: dark ? '#101817' : '#DCEFF0',
    pageMiddle: dark ? '#131C1B' : '#EAF5F5',
    pageStart: dark ? '#0E1413' : '#F4FAFA',
    text: tokens.text,
  }
  const cardOpacity = reduceTransparency ? 1 : 0.86
  const glassOpacity = reduceTransparency ? 1 : 0.82
  const barsProgress = useSharedValue(0)
  const listProgress = useSharedValue(0)
  const orbProgress = useSharedValue(0)
  const sparkProgress = useSharedValue(0)
  const hasLaidOut = useRef(false)
  const motionPending = useRef(false)

  const playSourceMotion = useCallback(() => {
    cancelAnimation(barsProgress)
    cancelAnimation(listProgress)
    cancelAnimation(orbProgress)
    cancelAnimation(sparkProgress)
    barsProgress.value = 0
    listProgress.value = 0
    orbProgress.value = 0
    sparkProgress.value = 0

    if (reduceMotion) return

    barsProgress.value = sourceMotionCycle(homeStorytellingMotionContract.bars.duration)
    listProgress.value = sourceMotionCycle(homeStorytellingMotionContract.list.duration)
    orbProgress.value = sourceMotionCycle(homeStorytellingMotionContract.orb.duration)
    sparkProgress.value = sourceMotionCycle(homeStorytellingMotionContract.spark.duration)
  }, [barsProgress, listProgress, orbProgress, reduceMotion, sparkProgress])

  useFocusEffect(
    useCallback(() => {
      motionPending.current = true
      if (hasLaidOut.current) {
        motionPending.current = false
        playSourceMotion()
      }

      return () => {
        motionPending.current = false
        cancelAnimation(barsProgress)
        cancelAnimation(listProgress)
        cancelAnimation(orbProgress)
        cancelAnimation(sparkProgress)
      }
    }, [barsProgress, listProgress, orbProgress, playSourceMotion, sparkProgress]),
  )

  const handleCardLayout = useCallback(() => {
    hasLaidOut.current = true
    if (!motionPending.current) return

    motionPending.current = false
    playSourceMotion()
  }, [playSourceMotion])

  const barsMotionProps = useAnimatedProps(() => ({
    transform: sourceMotionTransform(barsProgress.value, homeStorytellingMotionContract.bars),
  }))
  const listMotionProps = useAnimatedProps(() => ({
    transform: sourceMotionTransform(listProgress.value, homeStorytellingMotionContract.list),
  }))
  const orbMotionProps = useAnimatedProps(() => ({
    transform: sourceMotionTransform(orbProgress.value, homeStorytellingMotionContract.orb),
  }))
  const sparkMotionProps = useAnimatedProps(() => ({
    transform: sourceMotionTransform(sparkProgress.value, homeStorytellingMotionContract.spark),
  }))

  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor: colors.pageMiddle,
          shadowColor: dark ? '#000000' : '#265E6B',
          shadowOpacity: dark ? 0.18 : 0.15,
        },
      ]}
      onLayout={handleCardLayout}
      testID="customer-v21-home-hero"
    >
      <View
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityRole="image"
        accessible
        style={styles.canvas}
        testID="customer-v21-home-storytelling"
      >
        <Svg
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          testID="customer-v21-home-storytelling-backdrop"
          viewBox="0 0 1909 824"
          width="100%"
        >
          <Defs>
            <LinearGradient gradientUnits="userSpaceOnUse" id="story-page" x1="0" x2="1909" y1="0" y2="824">
              <Stop offset="0" stopColor={colors.pageStart} />
              <Stop offset="0.48" stopColor={colors.pageMiddle} />
              <Stop offset="1" stopColor={colors.pageEnd} />
            </LinearGradient>
            <RadialGradient
              cx="0"
              cy="0"
              gradientTransform="translate(1720 80) rotate(132) scale(720 610)"
              gradientUnits="userSpaceOnUse"
              id="story-page-mint"
              r="1"
            >
              <Stop offset="0" stopColor={dark ? '#4FC9BD' : '#8FE5DC'} stopOpacity={dark ? 0.16 : reduceTransparency ? 0.2 : 0.48} />
              <Stop offset="1" stopColor={dark ? '#4FC9BD' : '#8FE5DC'} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient gradientUnits="userSpaceOnUse" id="story-card" x1="94" x2="1804" y1="72" y2="745">
              <Stop offset="0" stopColor={colors.cardStart} stopOpacity={cardOpacity} />
              <Stop offset="0.55" stopColor={colors.cardMiddle} stopOpacity={cardOpacity} />
              <Stop offset="1" stopColor={colors.cardEnd} stopOpacity={cardOpacity} />
            </LinearGradient>
            <RadialGradient
              cx="0"
              cy="0"
              gradientTransform="translate(1452 394) rotate(174) scale(608 455)"
              gradientUnits="userSpaceOnUse"
              id="story-card-mint"
              r="1"
            >
              <Stop offset="0" stopColor={dark ? '#4FC9BD' : '#B7F2ED'} stopOpacity={dark ? 0.14 : reduceTransparency ? 0.2 : 0.56} />
              <Stop offset="1" stopColor={dark ? '#4FC9BD' : '#B7F2ED'} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="story-glass" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.glassStart} stopOpacity={glassOpacity} />
              <Stop offset="1" stopColor={colors.glassEnd} stopOpacity={glassOpacity} />
            </LinearGradient>
            <LinearGradient id="story-mint-disc" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={dark ? '#29423E' : '#FFFFFF'} />
              <Stop offset="1" stopColor={dark ? '#24534E' : '#BDF5EF'} />
            </LinearGradient>
            <LinearGradient id="story-badge-mint" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={dark ? '#55D1C5' : '#92E9E1'} />
              <Stop offset="1" stopColor={dark ? '#259D94' : '#43C8C1'} />
            </LinearGradient>
            <RadialGradient cx="0.5" cy="0.5" id="story-halo" r="0.5">
              <Stop offset="0" stopColor={dark ? '#9BE6DE' : '#FFFFFF'} stopOpacity={dark ? 0.16 : 0.84} />
              <Stop offset="0.35" stopColor={dark ? '#65D5CB' : '#D5F7F4'} stopOpacity={dark ? 0.12 : 0.62} />
              <Stop offset="0.65" stopColor="#6CD8D1" stopOpacity={dark ? 0.08 : 0.16} />
              <Stop offset="1" stopColor="#6CD8D1" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient cx="0.35" cy="0.22" id="story-orb" r="0.82">
              <Stop offset="0" stopColor="#F7FAFF" />
              <Stop offset="0.09" stopColor="#C8D0DC" />
              <Stop offset="0.24" stopColor="#697789" />
              <Stop offset="0.48" stopColor="#27313E" />
              <Stop offset="0.72" stopColor="#090E17" />
              <Stop offset="1" stopColor="#000205" />
            </RadialGradient>
            <LinearGradient id="story-orb-sheen" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
              <Stop offset="0.22" stopColor="#FFFFFF" stopOpacity={0.12} />
              <Stop offset="0.54" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>

          <Rect fill="url(#story-page)" height="824" width="1909" />
          <Rect fill="url(#story-page-mint)" height="824" width="1909" />
          <Rect fill="url(#story-card)" height="704" rx="96" stroke={dark ? tokens.glassBorder : '#FFFFFF'} strokeOpacity={dark ? 0.44 : 0.96} strokeWidth="2" width="1793" x="58" y="39" />
          <Rect fill="url(#story-card-mint)" height="702" rx="95" width="1791" x="59" y="40" />

          <G testID="customer-v21-home-storytelling-copy" transform="translate(158 220) scale(1.26) translate(-158 -278)">
            <SvgText fill={colors.text} fontFamily="Arial" fontSize="96" fontWeight="700" letterSpacing="-4.2" x="158" y="278">{copy.title[0]}</SvgText>
            <SvgText fill={colors.text} fontFamily="Arial" fontSize="96" fontWeight="700" letterSpacing="-4.2" x="158" y="371">{copy.title[1]}</SvgText>

            <SvgText fill={colors.muted} fontFamily="Arial" fontSize="35" fontWeight="400" letterSpacing="-0.9" x="160" y="436">{copy.body[0]}</SvgText>
            <SvgText fill={colors.muted} fontFamily="Arial" fontSize="35" fontWeight="400" letterSpacing="-0.9" x="160" y="481">{copy.body[1]}</SvgText>

            <Path d="M346 606H673" fill="none" stroke={colors.line} strokeDasharray="2 13" strokeLinecap="round" strokeOpacity={0.72} strokeWidth="3" />
            <Path d="M612 606H842" fill="none" stroke={colors.line} strokeDasharray="2 13" strokeLinecap="round" strokeOpacity={0.72} strokeWidth="3" />
          </G>

          <G testID="customer-v21-home-storytelling-steps" transform="translate(145 730) scale(1.22) translate(-156 -696)">
            {copy.steps.map((step, index) => (
              <StoryStepTile
                colors={colors}
                dark={dark}
                geometry={storyStepGeometry[index]}
                index={index}
                key={step.icon}
                step={step}
                tokens={tokens}
              />
            ))}
          </G>

          <G testID="customer-v21-home-storytelling-orb" transform="translate(1410 389) scale(1.26) translate(-1371 -389)">
            <Circle cx="1371" cy="389" fill="url(#story-halo)" r="326" />
            <Circle cx="1371" cy="389" fill="none" r="265" stroke={dark ? '#A6D8D2' : '#FFFFFF'} strokeOpacity={0.6} strokeWidth="2" />
            <Circle cx="1371" cy="389" fill="none" r="213" stroke="#7EDFD9" strokeOpacity={0.22} strokeWidth="2" />
            <Ellipse cx="1375" cy="389" fill="none" rx="328" ry="177" stroke="#62D8D1" strokeOpacity={0.44} strokeWidth="2" transform="rotate(12 1375 389)" />
            <Ellipse cx="1375" cy="389" fill="none" rx="281" ry="145" stroke="#48C6C1" strokeDasharray="4 11" strokeOpacity={0.36} strokeWidth="2" transform="rotate(-22 1375 389)" />
            <Circle cx="1597" cy="220" fill="#78E5DD" r="12" stroke={dark ? colors.cardStart : '#FFFFFF'} strokeWidth="3" />
            <Circle cx="1645" cy="505" fill="#72DDD6" r="8" stroke={dark ? colors.cardStart : '#FFFFFF'} strokeWidth="3" />
            <Circle cx="1048" cy="418" fill="#72DDD6" r="9" stroke={dark ? colors.cardStart : '#FFFFFF'} strokeWidth="3" />
            <Circle cx="1514" cy="595" fill="#72DDD6" r="7" stroke={dark ? colors.cardStart : '#FFFFFF'} strokeWidth="3" />

            <AnimatedGroup
              animatedProps={barsMotionProps}
              testID="customer-v21-home-storytelling-tile-bars-motion"
            >
              <Rect fill="url(#story-glass)" height="124" rx="29" stroke={dark ? tokens.glassBorder : '#FFFFFF'} strokeWidth="2" width="142" x="1051" y="116" />
              <Circle cx="1091" cy="150" fill="#53BDBA" opacity={0.56} r="5" />
              <Rect fill="#48B5B3" height="35" rx="6.5" width="13" x="1091" y="178" />
              <Rect fill="#51C6C1" height="59" rx="6.5" width="13" x="1117" y="154" />
              <Rect fill="#79E0D8" height="74" rx="6.5" width="13" x="1145" y="139" />
            </AnimatedGroup>

            <AnimatedGroup
              animatedProps={listMotionProps}
              testID="customer-v21-home-storytelling-tile-list-motion"
            >
              <Rect fill="url(#story-glass)" height="132" rx="30" stroke={dark ? tokens.glassBorder : '#FFFFFF'} strokeWidth="2" width="143" x="1578" y="332" />
              <Circle cx="1613" cy="373" fill="#4FAFAC" r="5" />
              <Circle cx="1616" cy="403" fill="#4FAFAC" opacity={0.75} r="5" />
              <Circle cx="1619" cy="433" fill="#4FAFAC" opacity={0.5} r="5" />
              <Path d="M1635 376L1685 382M1638 406L1680 411M1641 436L1688 442" fill="none" stroke="#4FAFAC" strokeLinecap="round" strokeWidth="7" />
            </AnimatedGroup>

            <AnimatedGroup
              animatedProps={sparkMotionProps}
              testID="customer-v21-home-storytelling-tile-spark-motion"
            >
              <Rect fill="url(#story-glass)" height="126" rx="29" stroke={dark ? tokens.glassBorder : '#FFFFFF'} strokeWidth="2" width="138" x="1070" y="531" />
              <Path d="M1138 555C1142 579 1155 592 1179 596C1155 600 1142 613 1138 637C1134 613 1121 600 1097 596C1121 592 1134 579 1138 555Z" fill="#48B5B3" />
              <Path d="M1170 550C1171 558 1176 563 1184 564C1176 565 1171 570 1170 578C1169 570 1164 565 1156 564C1164 563 1169 558 1170 550Z" fill="#8EE9E1" />
            </AnimatedGroup>

            <AnimatedGroup
              animatedProps={orbMotionProps}
              testID="customer-v21-home-storytelling-orb-reaction"
            >
              <Circle cx="1371" cy="389" fill="url(#story-orb)" r="177" stroke="#E7EDF2" strokeWidth="7" />
              <Circle cx="1371" cy="389" fill="none" r="172" stroke="#111821" strokeWidth="3" />
              <Path d="M1232 295C1269 231 1355 204 1433 231C1375 218 1305 245 1260 311C1248 329 1237 347 1225 375C1219 347 1220 318 1232 295Z" fill="url(#story-orb-sheen)" opacity={0.72} />
              <Ellipse cx="1326" cy="306" fill="#FFFFFF" opacity={0.37} rx="38" ry="16" transform="rotate(-30 1326 306)" />
              <Rect fill="#F7F9FC" height="58" rx="7.5" transform="rotate(-6 1314.5 367)" width="15" x="1307" y="338" />
              <Circle cx="1406" cy="361" fill="none" r="46" stroke="#F3F6F8" strokeWidth="5" />
              <Circle cx="1406" cy="361" fill="none" r="41" stroke="#111821" strokeWidth="2" />
              <Rect fill="#F7F9FC" height="49" rx="6" width="12" x="1401" y="337" />
              <Circle cx="1450" cy="338" fill="#A7B2BC" r="6" stroke="#F7F9FC" strokeWidth="2" />
              <Path d="M1448 382C1466 400 1460 420 1481 435C1499 448 1498 473 1521 482" fill="none" stroke="#E4EAF0" strokeDasharray="2 8" strokeLinecap="round" strokeWidth="3" />
              <Circle cx="1523" cy="484" fill="none" r="14" stroke="#E9EEF2" strokeWidth="3" />
              <Circle cx="1523" cy="484" fill="none" r="9" stroke="#98A5B0" strokeWidth="2" />
            </AnimatedGroup>
          </G>

        </Svg>
      </View>
    </View>
  )
}

function StoryStepTile({
  colors,
  dark,
  geometry,
  index,
  step,
  tokens,
}: {
  colors: {
    glassEnd: string
    glassStart: string
    mint: string
    text: string
  }
  dark: boolean
  geometry: (typeof storyStepGeometry)[number]
  index: number
  step: StoryStep
  tokens: CustomerThemeTokens
}) {
  return (
    <G testID={`customer-v21-home-story-step-${index + 1}`}>
      <Rect fill="url(#story-glass)" height="192" rx="34" stroke={dark ? tokens.glassBorder : '#FFFFFF'} strokeWidth="2" width={geometry.width} x={geometry.x} y="504" />
      <Circle cx={geometry.centerX} cy="579" fill="url(#story-mint-disc)" r="45" stroke={dark ? tokens.glassBorder : '#FFFFFF'} strokeWidth="2" />
      <G transform={`translate(${geometry.centerX} 579) scale(1.15) translate(${-geometry.centerX} -579)`}>
        <StoryStepIcon color={colors.mint} icon={step.icon} x={geometry.centerX} />
      </G>
      <Circle cx={geometry.badgeX} cy="652" fill="url(#story-badge-mint)" r="19" stroke={dark ? colors.glassStart : '#FFFFFF'} strokeWidth="2" />
      <SvgText fill="#FFFFFF" fontFamily="Arial" fontSize="20" fontWeight="700" textAnchor="middle" x={geometry.badgeX} y="659">{index + 1}</SvgText>
      <SvgText fill={colors.text} fontFamily="Arial" fontSize="27" fontWeight="500" letterSpacing="-0.5" x={geometry.labelX} y="661">{step.label}</SvgText>
    </G>
  )
}

function StoryStepIcon({ color, icon, x }: { color: string; icon: StoryStep['icon']; x: number }) {
  if (icon === 'inspect') {
    return (
      <>
        <Circle cx={x - 7} cy="578" fill="none" r="11" stroke={color} strokeWidth="5" />
        <Circle cx={x - 7} cy="578" fill={color} r="3.5" />
        <Path d={`M${x + 1} 586L${x + 13} 598`} fill="none" stroke={color} strokeLinecap="round" strokeWidth="5" />
        <Path d={`M${x - 20} 578H${x - 26}M${x - 7} 565V559M${x + 6} 578H${x + 12}`} fill="none" stroke={color} strokeLinecap="round" strokeOpacity={0.5} strokeWidth="3" />
      </>
    )
  }

  if (icon === 'context') {
    return (
      <>
        <Rect fill="none" height="23" rx="6" stroke={color} strokeWidth="4" width="32" x={x - 16} y="568" />
        <Path d={`M${x - 9} 591L${x - 14} 598V588`} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <Circle cx={x - 7} cy="579" fill={color} r="2" />
        <Circle cx={x} cy="579" fill={color} r="2" />
        <Circle cx={x + 7} cy="579" fill={color} r="2" />
      </>
    )
  }

  return (
    <>
      <Circle cx={x} cy="570" fill="none" r="8" stroke={color} strokeWidth="4" />
      <Path d={`M${x - 15} 593C${x - 13} 582 ${x - 8} 579 ${x} 579C${x + 8} 579 ${x + 14} 582 ${x + 16} 593`} fill="none" stroke={color} strokeLinecap="round" strokeWidth="4" />
    </>
  )
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    width: '100%',
  },
  frame: {
    aspectRatio: 1909 / 824,
    borderRadius: 30,
    elevation: 3,
    marginTop: 14,
    maxWidth: '100%',
    overflow: 'hidden',
    shadowOffset: { height: 18, width: 0 },
    shadowRadius: 28,
    width: '100%',
  },
})
