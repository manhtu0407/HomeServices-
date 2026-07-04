import type { ReactNode } from 'react'
import { ScrollView, View, type ImageSourcePropType } from 'react-native'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import {
  WorkerV5KaelOrbBubble,
  WorkerV5KaelOrbMediaStrip,
  WorkerV5KaelOrbOpportunityResults,
} from './orb-surfaces'
import { styles } from './body-styles'

type WorkerV5ServiceIconMap = Partial<Record<ServiceType, ImageSourcePropType>>

export function WorkerV5KaelOrbBody({
  composer,
  deal,
  fallbackJobIcon,
  language,
  mode,
  modeMenuOpen = false,
  onOpenOpportunity,
  reduceTransparency,
  serviceIcons,
}: {
  composer: ReactNode
  deal: LocalDeal | null
  fallbackJobIcon: ImageSourcePropType
  language: AppLanguage
  mode: 'intake' | 'normal'
  modeMenuOpen?: boolean
  onOpenOpportunity: () => void
  reduceTransparency: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  return (
    <View style={styles.kaelOrbCustomerShell} testID={`worker-v5-kael-orb-${mode}`}>
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.kaelOrbCustomerTranscript, modeMenuOpen ? styles.kaelOrbCustomerTranscriptMenuOpen : null]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.kaelOrbCustomerTranscriptScroll}
        testID="worker-v5-kael-orb-transcript"
      >
        {mode === 'normal' ? (
          <WorkerV5KaelOrbNormalThread
            deal={deal}
            language={language}
            reduceTransparency={reduceTransparency}
          />
        ) : (
          <WorkerV5KaelOrbIntakeThread
            deal={deal}
            fallbackJobIcon={fallbackJobIcon}
            language={language}
            onOpenOpportunity={onOpenOpportunity}
            reduceTransparency={reduceTransparency}
            serviceIcons={serviceIcons}
          />
        )}
      </ScrollView>
      {composer}
    </View>
  )
}

export function WorkerV5KaelOrbNormalThread({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const service = deal?.draft.serviceType ? localizedServiceLabel(deal.draft.serviceType, language) : null
  const area = deal?.draft.districtLabel || deal?.broadcast?.generalArea || null
  const hasMedia = (deal?.draft.mediaCount ?? 0) > 0
  const customerKaelBody = deal
    ? textByLanguage(
        language,
        `Kael đang đọc dữ liệu thật${service ? ` của ${service}` : ''}${area ? ` tại ${area}` : ''}. Chat thường chỉ tư vấn và không ghi quyết định vào công việc.`,
        `Kael is reading real data${service ? ` for ${service}` : ''}${area ? ` in ${area}` : ''}. Normal chat is advisory only and does not write case decisions.`,
      )
    : textByLanguage(
        language,
        'Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?',
        'Hi, I am Kael. What would you like to ask today?',
      )
  const customerWorkerPrompt = textByLanguage(
    language,
    `Kael, hỗ trợ tôi chuẩn bị${service ? ` ${service}` : ''}${area ? ` tại ${area}` : ''}.`,
    `Kael, help me prepare${service ? ` ${service}` : ''}${area ? ` in ${area}` : ''}.`,
  )

  return (
    <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-normal-thread">
      {deal ? (
        <WorkerV5KaelOrbBubble
          align="right"
          body={customerWorkerPrompt}
          role={textByLanguage(language, 'Bạn', 'You')}
        />
      ) : null}
      <WorkerV5KaelOrbBubble body={customerKaelBody} role="Kael" strongFirstLine={Boolean(deal)} />
      {hasMedia ? <WorkerV5KaelOrbMediaStrip count={Math.min(2, deal?.draft.mediaCount ?? 0)} reduceTransparency={reduceTransparency} /> : null}
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
      <WorkerV5KaelOrbBubble align="right" body={customerWorkerRequest} role={textByLanguage(language, 'Bạn', 'You')} />
      <WorkerV5KaelOrbBubble body={customerKaelReply} role="Kael" />
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
          role="Kael"
          strongFirstLine
        />
      ) : null}
    </View>
  )
}
