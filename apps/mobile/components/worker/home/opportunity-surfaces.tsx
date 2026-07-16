import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import {
  WorkerV5SourceProgressBar,
  type WorkerV5InboxTabId,
} from '../jobs/source-surfaces'
import { styles } from './opportunity-styles'

type WorkerV5ServiceIconMap = Partial<Record<ServiceType, ImageSourcePropType>>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5OpportunityCard({
  deal,
  fallbackJobIcon,
  language,
  onOpenOpportunity,
  onSelect,
  reduceTransparency,
  selected = false,
  serviceIcons,
}: {
  deal: LocalDeal
  fallbackJobIcon: ImageSourcePropType
  language: AppLanguage
  onOpenOpportunity?: () => void
  onSelect?: () => void
  reduceTransparency: boolean
  selected?: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  const earning = deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning')
  const area = deal.broadcast?.generalArea || deal.draft.districtLabel || textByLanguage(language, 'Khu vực đang ẩn', 'Area hidden')
  const serviceLabel = localizedServiceLabel(deal.draft.serviceType, language)
  const serviceIcon = deal.draft.serviceType ? serviceIcons[deal.draft.serviceType] ?? fallbackJobIcon : fallbackJobIcon
  const distanceLabel = deal.broadcast
    ? textByLanguage(language, 'Đã gửi tới bạn', 'Sent to you')
    : textByLanguage(language, 'Chưa có broadcast', 'No broadcast yet')
  const content = (
    <>
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope={`Opportunity${deal.id}`}
        testID={`worker-v5-opportunity-card-formula-mint-aura-${deal.id}`}
      />
      <WorkerV5IntegratedIcon bleed={11} image={serviceIcon} reduceTransparency={reduceTransparency} tone="service" variant="compactPanel" />
      <View style={styles.opportunityTextColumn} testID="worker-v5-opportunity-copy">
        <Text style={styles.opportunityTitle} numberOfLines={1}>{serviceLabel}</Text>
        <WorkerV5DetailRail
          items={[
            { glyph: 'arrival', label: workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt) },
            { glyph: 'location', label: area },
          ]}
          testID="worker-v5-opportunity-detail"
        />
      </View>
      <View style={styles.opportunityPayoutColumn}>
        <Text style={styles.opportunityPayout} numberOfLines={1}>{earning}</Text>
        <Text style={styles.opportunityCaption} numberOfLines={1}>{distanceLabel}</Text>
        {onOpenOpportunity ? (
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Mở cơ hội thật', 'Open real opportunity')}
            accessibilityRole="button"
            onPress={onOpenOpportunity}
            style={({ pressed }) => [styles.opportunityOpenButton, pressed ? styles.pressed : null]}
            testID="worker-v5-intake-open-opportunity"
          >
            <Text style={styles.opportunityOpenButtonText}>{textByLanguage(language, 'Mở', 'Open')}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  )

  const cardStyle = [
    styles.opportunityCard,
    selected && styles.opportunityCardSelected,
    reduceTransparency && styles.opaqueCard,
  ]

  if (onSelect) {
    return (
      <Pressable
        accessibilityLabel={textByLanguage(language, `Chọn công việc ${serviceLabel}`, `Select ${serviceLabel} job`)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
        testID="worker-v5-opportunity-card"
      >
        {content}
      </Pressable>
    )
  }

  return (
    <View style={cardStyle} testID="worker-v5-opportunity-card">
      {content}
    </View>
  )
}

export function WorkerV5OpportunityEmptyCard({
  jobIcon,
  language,
  reduceTransparency,
  tab,
}: {
  jobIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  tab: WorkerV5InboxTabId
}) {
  const title = tab === 'new'
    ? textByLanguage(language, 'Chưa có cơ hội mới', 'No new opportunity yet')
    : tab === 'saved'
      ? textByLanguage(language, 'Chưa có cơ hội đã lưu', 'No saved opportunity yet')
      : textByLanguage(language, 'Chưa có cơ hội phù hợp', 'No matching opportunity yet')
  const body = tab === 'new'
    ? textByLanguage(language, 'Cơ hội mới chỉ hiện khi NestScout gửi broadcast thật tới thợ.', 'New opportunities appear only after NestScout sends a real broadcast to the worker.')
    : tab === 'saved'
      ? textByLanguage(language, 'Cơ hội đã lưu sẽ hiện ở đây khi backend đồng bộ danh sách lưu thật.', 'Saved opportunities appear here after the backend syncs a real saved list.')
      : textByLanguage(language, 'Danh sách chỉ hiện cơ hội thật NestScout đã gửi tới thợ.', 'The list only shows real NestScout opportunities sent to the worker.')
  return (
    <View style={[styles.opportunityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-opportunity-empty-card">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope={`OpportunityEmpty${tab}`}
        testID="worker-v5-opportunity-empty-card-formula-mint-aura"
      />
      <WorkerV5IntegratedIcon bleed={11} image={jobIcon} reduceTransparency={reduceTransparency} tone="service" variant="compactPanel" />
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.opportunityMeta} numberOfLines={2}>
          {body}
        </Text>
        <WorkerV5DetailRail
          items={[
            { glyph: 'sync', label: textByLanguage(language, 'Chờ broadcast thật', 'Waiting for real broadcast') },
            { glyph: 'shield', label: textByLanguage(language, 'Chỉ dữ liệu thật', 'Real data only') },
          ]}
          testID="worker-v5-opportunity-empty-detail"
        />
        <WorkerV5SourceProgressBar active={false} label={textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')} />
      </View>
    </View>
  )
}
