import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'
import Svg, { Circle, Defs, LinearGradient } from 'react-native-svg'
import type { LocalDeal } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { color } from '@/design/theme'
import { localizedStatusLabel, type AppLanguage } from '@/lib/app-language'

import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerCaseWorkCardAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5SourceCardSkin,
  WorkerV5SuccessCheckFill,
  WorkerV5SuccessEmblemAura,
} from './aura-surfaces'
import { textByLanguage } from './format'
import { workerStatusStage } from './labels'
import { styles } from './metrics-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SuccessEmblem({
  body,
  reduceTransparency,
  status,
  title,
}: {
  body: string
  reduceTransparency?: boolean
  status?: string
  title: string
}) {
  return (
    <View style={[styles.successCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-success-emblem">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.successAura} testID="worker-v5-completion-submitted-mint-aura" /> : null}
      <View style={styles.successEmblem}>
        {!reduceTransparency ? <WorkerV5SuccessEmblemAura scope="CompletionSubmitted" testID="worker-v5-success-emblem-aura" /> : null}
        <View style={styles.successCheck}>
          {!reduceTransparency ? <WorkerV5SuccessCheckFill scope="CompletionSubmitted" testID="worker-v5-success-check-fill" /> : null}
          <Text style={styles.successCheckText}>✓</Text>
        </View>
      </View>
      {status ? (
        <View style={styles.successStatusPill}>
          <View style={styles.statusDotSmall} />
          <Text style={styles.successStatusText} numberOfLines={2}>{status}</Text>
        </View>
      ) : null}
      <Text style={styles.successTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.successBody} numberOfLines={3}>{body}</Text>
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
