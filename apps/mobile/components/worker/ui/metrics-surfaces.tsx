import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Rect } from 'react-native-svg'
import type { LocalDeal } from '@nestscout/shared'

import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { color } from '@/design/theme'
import { localizedStatusLabel, type AppLanguage } from '@/lib/app-language'

import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerCaseWorkCardAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5FormulaMintCardAura,
  WorkerV5SourceCardSkin,
} from './aura-surfaces'
import { textByLanguage } from './format'
import { workerStatusStage } from './labels'
import { styles } from './metrics-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export type WorkerV5CompletionHeroState = 'confirmed' | 'empty' | 'waiting'

export function WorkerV5PremiumStatusSeal({
  accessibilityLabel,
  artTestID,
  reduceTransparency,
  size = 'default',
  testID,
}: {
  accessibilityLabel: string
  artTestID?: string
  reduceTransparency?: boolean
  size?: 'default' | 'large'
  testID: string
}) {
  const isLarge = size === 'large'
  const artSize = isLarge ? 60 : 52

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[
        styles.completionStateIcon,
        styles.completionStateIconSubmitted,
        isLarge && styles.completionStateIconLarge,
        reduceTransparency && styles.completionStateIconSubmittedOpaque,
      ]}
      testID={testID}
    >
      <View style={[
        styles.completionStateIconRim,
        isLarge && styles.completionStateIconRimLarge,
        reduceTransparency && styles.completionStateIconRimOpaque,
      ]}>
        <Svg
          height={artSize}
          width={artSize}
          viewBox="0 0 52 52"
          testID={artTestID}
        >
          <Defs>
            <LinearGradient id="worker-v5-premium-seal-fill" x1="0" x2="1" y1="0" y2="1">
              <Stop offset={0} stopColor="#3BD0BA" />
              <Stop offset={0.52} stopColor="#17A995" />
              <Stop offset={1} stopColor="#007E72" />
            </LinearGradient>
            <LinearGradient id="worker-v5-premium-check-stroke" x1="0" x2="0" y1="0" y2="1">
              <Stop offset={0} stopColor="#FFFFFF" />
              <Stop offset={1} stopColor="#E7FFFA" />
            </LinearGradient>
          </Defs>
          <Circle
            cx={26}
            cy={26}
            fill="url(#worker-v5-premium-seal-fill)"
            r={24.5}
          />
          <Circle
            cx={26}
            cy={26}
            fill="none"
            r={23.8}
            stroke="rgba(255,255,255,0.30)"
            strokeWidth={1}
          />
          <Path
            d="M11.5 22.4C13.5 15.7 19.1 11.5 26.4 11"
            fill="none"
            stroke="rgba(255,255,255,0.42)"
            strokeLinecap="round"
            strokeWidth={1.5}
          />
          <Path
            d="M14.1 26.5L21.7 33.2L38.2 17.5"
            fill="none"
            stroke="rgba(0,69,64,0.20)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5.2}
            transform="translate(0 1.2)"
          />
          <Path
            d="M14.1 26.5L21.7 33.2L38.2 17.5"
            fill="none"
            stroke="url(#worker-v5-premium-check-stroke)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={4.2}
          />
        </Svg>
      </View>
    </View>
  )
}

export function WorkerV5PremiumStatusPill({
  label,
  mark = 'dot',
  markTestID,
  reduceTransparency,
  testID,
  textTestID,
}: {
  label: string
  mark?: 'check' | 'dot'
  markTestID?: string
  reduceTransparency?: boolean
  testID: string
  textTestID?: string
}) {
  return (
    <View
      style={[
        styles.successStatusPill,
        reduceTransparency && styles.successStatusPillOpaque,
      ]}
      testID={testID}
    >
      <View style={[
        styles.successStatusPillInner,
        reduceTransparency && styles.successStatusPillInnerOpaque,
      ]}>
        <View style={styles.successStatusMark} testID={markTestID}>
          <Svg height={16} width={16} viewBox="0 0 16 16">
            <Defs>
              <LinearGradient id="worker-v5-premium-status-fill" x1="0" x2="1" y1="0" y2="1">
                <Stop offset={0} stopColor="#3BD0BA" />
                <Stop offset={1} stopColor="#007E72" />
              </LinearGradient>
            </Defs>
            <Circle
              cx={8}
              cy={8}
              fill="url(#worker-v5-premium-status-fill)"
              r={7.4}
            />
            <Circle
              cx={8}
              cy={8}
              fill="none"
              r={6.7}
              stroke="rgba(255,255,255,0.34)"
              strokeWidth={0.8}
            />
            <Path
              d="M4.2 6.3C4.9 4.4 6.3 3.5 8.2 3.3"
              fill="none"
              stroke="rgba(255,255,255,0.46)"
              strokeLinecap="round"
              strokeWidth={0.9}
            />
            {mark === 'check' ? (
              <Path
                d="M4.4 8.1L6.8 10.2L11.8 5.4"
                fill="none"
                stroke="#F4FFFC"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
              />
            ) : null}
          </Svg>
        </View>
        <Text style={styles.successStatusText} numberOfLines={2} testID={textTestID}>{label}</Text>
      </View>
    </View>
  )
}

export function WorkerV5SuccessEmblem({
  body,
  reduceTransparency,
  state,
  status,
  title,
}: {
  body: string
  reduceTransparency?: boolean
  state: WorkerV5CompletionHeroState
  status?: string
  title: string
}) {
  const isEmpty = state === 'empty'

  return (
    <View style={[styles.successCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-success-emblem">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="CompletionSubmitted"
        testID="worker-v5-completion-submitted-mint-aura"
      />
      {isEmpty ? (
        <View
          accessibilityLabel={title}
          accessibilityRole="image"
          style={[styles.completionStateIcon, styles.completionStateIconEmpty]}
          testID="worker-v5-completion-submitted-icon-empty"
        >
          <Svg height={28} width={28} viewBox="0 0 28 28">
            <Rect
              fill="none"
              height={21}
              rx={3.5}
              stroke="#607976"
              strokeWidth={1.6}
              width={16}
              x={6}
              y={3.5}
            />
            <Path
              d="M10 10h8M10 14h8M10 18h5"
              fill="none"
              stroke="#607976"
              strokeLinecap="round"
              strokeWidth={1.6}
            />
          </Svg>
        </View>
      ) : (
        <WorkerV5PremiumStatusSeal
          accessibilityLabel={title}
          artTestID="worker-v5-completion-submitted-seal-art"
          reduceTransparency={reduceTransparency}
          testID="worker-v5-completion-submitted-seal"
        />
      )}
      <Text style={styles.successTitle} numberOfLines={2} testID="worker-v5-completion-submitted-title">{title}</Text>
      <Text style={styles.successBody} numberOfLines={3}>{body}</Text>
      {status ? (
        <WorkerV5PremiumStatusPill
          label={status}
          mark={state === 'confirmed' ? 'check' : 'dot'}
          markTestID="worker-v5-completion-submitted-status-dot"
          reduceTransparency={reduceTransparency}
          testID="worker-v5-completion-submitted-status"
        />
      ) : null}
    </View>
  )
}

export function WorkerV5TimerCard({
  deal,
  language,
  reduceTransparency,
  sourceCount,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  sourceCount: number
}) {
  const stage = workerStatusStage(deal?.status)
  const status = deal ? localizedStatusLabel(deal.status, language) : textByLanguage(language, 'Chưa có việc', 'No work')
  const caption = sourceCount > 0
    ? textByLanguage(language, `${sourceCount} nguồn kiểm tra thật`, `${sourceCount} real checklist sources`)
    : textByLanguage(language, 'Chờ nguồn kiểm tra thật từ việc', 'Waiting for real checklist sources')
  const radiusPx = 30
  const circumference = 2 * Math.PI * radiusPx
  const dashOffset = circumference - (stage.progress / 100) * circumference

  return (
    <View style={[styles.timerCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-timer-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5SourceCardSkin testID="worker-v5-in-progress-card-skin" />
          <WorkerV5CustomerCaseWideMintAura scope="JobProgressHero" testID="worker-v5-in-progress-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="JobProgressHeroFine" testID="worker-v5-in-progress-zip-mint-aura" />
          <WorkerV5CustomerCaseWorkCardAura scope="JobProgressHeroSoft" testID="worker-v5-in-progress-card-mint-aura" />
        </>
      ) : null}
      <View style={styles.timerTextColumn}>
        <Text style={styles.timerLabel}>{textByLanguage(language, 'Tiến độ theo trạng thái', 'Status-based progress')}</Text>
        <Text style={styles.timerValue} numberOfLines={1}>{status}</Text>
        <Text style={styles.timerCaption} numberOfLines={2} testID="worker-v5-timer-caption">{caption}</Text>
      </View>
      <View
        accessibilityLabel={textByLanguage(language, `Mốc ${stage.current} trên ${stage.total}`, `Step ${stage.current} of ${stage.total}`)}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: stage.total, min: 0, now: stage.current }}
        style={styles.timerRing}
      >
        <Svg height={70} width={70} viewBox="0 0 70 70">
          <Defs>
            <LinearGradient id="worker-v5-timer-gradient" x1="0" x2="1" y1="0" y2="1">
              <Stop offset={0} stopColor={color.mint.mint300} />
              <Stop offset={0.58} stopColor={color.brand.primary} />
              <Stop offset={1} stopColor={color.brand.primaryDark} />
            </LinearGradient>
          </Defs>
          <Circle cx={35} cy={35} r={radiusPx} fill="none" stroke="rgba(205,228,223,0.62)" strokeWidth={7} />
          <Circle
            cx={35}
            cy={35}
            r={radiusPx}
            fill="none"
            stroke="url(#worker-v5-timer-gradient)"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={7}
            transform="rotate(-90 35 35)"
          />
        </Svg>
        <View style={styles.timerRingLens}>
          <Text style={styles.timerRingValue}>{stage.current}/{stage.total}</Text>
        </View>
      </View>
    </View>
  )
}

export function WorkerV5BoundaryNote({
  body,
  formulaAura = false,
  reduceTransparency = false,
  title,
}: {
  body: string
  formulaAura?: boolean
  reduceTransparency?: boolean
  title: string
}) {
  return (
    <View style={[styles.boundaryNote, reduceTransparency && styles.opaqueCard]} testID="worker-v5-boundary-note">
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="BoundaryNoteWide" style={styles.checkInChecklistAura} testID="worker-v5-boundary-note-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="BoundaryNoteFine" style={styles.checkInChecklistZipAura} testID="worker-v5-boundary-note-zip-mint-aura" />
        </>
      ) : null}
      <Text style={styles.boundaryTitle}>{title}</Text>
      <Text style={styles.boundaryBody}>{body}</Text>
    </View>
  )
}
