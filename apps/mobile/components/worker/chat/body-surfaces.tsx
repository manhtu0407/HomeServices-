import { useEffect, useRef, type ReactNode } from 'react'
import { ScrollView, View, type ImageSourcePropType } from 'react-native'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import {
  WorkerV5KaelOrbBubble,
  WorkerV5KaelOrbOpportunityResults,
} from './orb-surfaces'
import { WorkerV5KaelEmptyHero } from './empty-hero'
import { styles } from './body-styles'

type WorkerV5ServiceIconMap = Partial<Record<ServiceType, ImageSourcePropType>>

export type WorkerV5KaelOrbLiveTurn = {
  id: string
  role: 'kael' | 'worker'
  text: string
}

const EMPTY_LIVE_TURNS: WorkerV5KaelOrbLiveTurn[] = []

export function WorkerV5KaelOrbBody({
  activeSessionId = null,
  composer,
  composerActive = false,
  deal,
  fallbackJobIcon,
  keepIntakeContextAccessible = false,
  language,
  liveError = null,
  liveStatus = null,
  liveTurns = EMPTY_LIVE_TURNS,
  mode,
  modeMenuOpen = false,
  onOpenOpportunity,
  reduceMotion = false,
  reduceTransparency,
  serviceIcons,
}: {
  activeSessionId?: string | null
  composer: ReactNode
  composerActive?: boolean
  deal: LocalDeal | null
  fallbackJobIcon: ImageSourcePropType
  keepIntakeContextAccessible?: boolean
  language: AppLanguage
  liveError?: string | null
  liveStatus?: string | null
  liveTurns?: WorkerV5KaelOrbLiveTurn[]
  mode: 'intake' | 'normal'
  modeMenuOpen?: boolean
  onOpenOpportunity: () => void
  reduceMotion?: boolean
  reduceTransparency: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  const hasActiveSession = Boolean(activeSessionId)
  const hasLiveTurns = liveTurns.length > 0
  const hasLiveThread = hasLiveTurns || Boolean(liveStatus) || Boolean(liveError)
  const showEmptyHero = !hasLiveTurns && !composerActive
  const transcriptRef = useRef<ScrollView>(null)

  useEffect(() => {
    if (!activeSessionId || !hasLiveThread) return
    transcriptRef.current?.scrollToEnd({ animated: !reduceMotion })
  }, [activeSessionId, hasLiveThread, liveTurns.length, reduceMotion])

  const scrollToRestoredThread = () => {
    if (!activeSessionId || !hasLiveThread) return
    transcriptRef.current?.scrollToEnd({ animated: !reduceMotion })
  }

  return (
    <View style={styles.kaelOrbCustomerShell} testID={`worker-v5-kael-orb-${mode}`}>
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.kaelOrbCustomerTranscript,
          showEmptyHero ? styles.kaelOrbCustomerTranscriptEmpty : null,
          modeMenuOpen ? styles.kaelOrbCustomerTranscriptMenuOpen : null,
        ]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToRestoredThread}
        ref={transcriptRef}
        showsVerticalScrollIndicator={false}
        style={styles.kaelOrbCustomerTranscriptScroll}
        testID="worker-v5-kael-orb-transcript"
      >
        {showEmptyHero ? (
          <WorkerV5KaelEmptyHero
            language={language}
            mode={mode}
            reduceMotion={reduceMotion}
          />
        ) : null}
        {(!showEmptyHero || keepIntakeContextAccessible) && !hasActiveSession && !hasLiveThread && mode === 'intake' ? (
          <WorkerV5KaelOrbIntakeThread
            deal={deal}
            fallbackJobIcon={fallbackJobIcon}
            language={language}
            onOpenOpportunity={onOpenOpportunity}
            reduceTransparency={reduceTransparency}
            serviceIcons={serviceIcons}
          />
        ) : null}
        {hasLiveThread ? (
          <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-orb-live-thread">
            {liveTurns.slice(-8).map((turn) => (
              <WorkerV5KaelOrbBubble
                align={turn.role === 'worker' ? 'right' : undefined}
                body={turn.text}
                key={turn.id}
                speaker={turn.role === 'worker' ? textByLanguage(language, 'Bạn', 'You') : 'Kael'}
              />
            ))}
            {liveStatus ? <WorkerV5KaelOrbBubble body={liveStatus} speaker="Kael" /> : null}
            {liveError ? <WorkerV5KaelOrbBubble body={liveError} speaker="Kael" /> : null}
          </View>
        ) : null}
      </ScrollView>
      {composer}
    </View>
  )
}

export function WorkerV5KaelOrbIntakeThread({
  deal,
  fallbackJobIcon,
  language,
  onOpenOpportunity,
  reduceTransparency,
  serviceIcons,
}: {
  deal: LocalDeal | null
  fallbackJobIcon: ImageSourcePropType
  language: AppLanguage
  onOpenOpportunity: () => void
  reduceTransparency: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  const service = deal?.broadcast?.serviceType ?? deal?.draft.serviceType
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel || null
  const serviceLabel = service ? localizedServiceLabel(service, language) : null
  const hasOpportunity = Boolean(deal?.broadcast)
  if (!hasOpportunity) {
    return (
      <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
        <WorkerV5KaelOrbOpportunityResults
          deal={deal}
          fallbackJobIcon={fallbackJobIcon}
          language={language}
          onOpenOpportunity={onOpenOpportunity}
          reduceTransparency={reduceTransparency}
          serviceIcons={serviceIcons}
        />
      </View>
    )
  }
  const customerWorkerRequest = textByLanguage(
    language,
    `Tìm việc${serviceLabel ? ` ${serviceLabel}` : ''}${area ? ` tại ${area}` : ''} từ nguồn cơ hội thật.`,
    `Find${serviceLabel ? ` ${serviceLabel}` : ''} work${area ? ` in ${area}` : ''} from real opportunity sources.`,
  )
  const customerKaelReply = textByLanguage(
    language,
    'Kael đã đối chiếu kỹ năng, lịch trống, thời gian đến, độ tin cậy khách và thanh toán bảo vệ từ dữ liệu hiện có.',
    'Kael has compared skills, schedule, ETA, customer reliability, and protected payment from available data.',
  )

  return (
    <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
      <WorkerV5KaelOrbBubble align="right" body={customerWorkerRequest} speaker={textByLanguage(language, 'Bạn', 'You')} />
      <WorkerV5KaelOrbBubble body={customerKaelReply} speaker="Kael" />
      <WorkerV5KaelOrbOpportunityResults
        deal={deal}
        fallbackJobIcon={fallbackJobIcon}
        language={language}
        onOpenOpportunity={onOpenOpportunity}
        reduceTransparency={reduceTransparency}
        serviceIcons={serviceIcons}
      />
      {hasOpportunity ? (
        <WorkerV5KaelOrbBubble
          body={textByLanguage(
            language,
            'Đề xuất: mở cơ hội đầu tiên nếu dữ liệu thật đạt đủ điều kiện và không ảnh hưởng lịch còn lại.',
            'Suggestion: open the first opportunity if real data meets the conditions and does not affect the remaining schedule.',
          )}
          speaker="Kael"
          strongFirstLine
        />
      ) : null}
    </View>
  )
}
