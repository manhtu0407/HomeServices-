import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import { type LocalDeal, type ServiceType } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, localizedStatusLabel, type AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { routeDestinationLabel, workerV5TimeChoiceLabel } from '../ui/labels'
import { buildWorkerV5OfferSummaryChips, type WorkerV5OfferDetailRow } from './offer'
import { styles } from './offer-styles'

type WorkerV5AuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5OfferDetailSummaryCard({
  caseWideAura: CaseWideAura,
  deal,
  jobIcon,
  language,
  reduceTransparency,
  serviceIcons,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AuraComponent
  deal: LocalDeal
  jobIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  serviceIcons: Record<ServiceType, ImageSourcePropType>
  zipAura: WorkerV5AuraComponent
}) {
  const serviceLabel = localizedServiceLabel(deal.draft.serviceType, language)
  const serviceIcon = deal.draft.serviceType ? serviceIcons[deal.draft.serviceType] : jobIcon
  const earning = deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning')
  const area = routeDestinationLabel(deal, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.inferredProblemLabel || deal.draft.description
  const meta = problem
    ? `${workerV5TimeChoiceLabel(deal.draft.timeChoice, language)} · ${problem}`
    : `${workerV5TimeChoiceLabel(deal.draft.timeChoice, language)} · ${area}`
  const status = deal.broadcast?.status === 'sent'
    ? textByLanguage(language, 'Mới từ nguồn thật', 'New from real source')
    : localizedStatusLabel(deal.status, language)
  const chipItems = buildWorkerV5OfferSummaryChips(deal, language)

  return (
    <View style={[styles.offerDetailSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-offer-detail-summary-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="OfferDetailSummaryWide"
            style={styles.offerDetailSummaryAura}
            testID="worker-v5-offer-detail-summary-mint-aura"
          />
          <ZipAura
            scope="OfferDetailSummaryFine"
            style={styles.offerDetailSummaryZipAura}
            testID="worker-v5-offer-detail-summary-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.offerDetailSummaryLine}>
        <View style={styles.offerDetailIconTile}>
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image resizeMode="contain" source={serviceIcon} style={styles.offerDetailIcon} />
        </View>
        <View style={styles.offerDetailSummaryCopy}>
          <Text style={styles.offerDetailStatusChip} numberOfLines={1}>{status}</Text>
          <Text style={styles.offerDetailTitle} numberOfLines={2} testID="worker-v5-offer-summary-title">{serviceLabel}</Text>
          <Text style={styles.offerDetailMeta} numberOfLines={2} testID="worker-v5-offer-summary-meta">{meta}</Text>
        </View>
        <Text style={styles.offerDetailPrice} numberOfLines={2} testID="worker-v5-offer-summary-price">{earning}</Text>
      </View>
      <View style={styles.offerDetailChipRow} testID="worker-v5-offer-summary-chip-row">
        {chipItems.map((item, index) => (
          <Text key={item} style={styles.offerDetailChip} numberOfLines={1} testID={`worker-v5-offer-summary-chip-${index}`}>{item}</Text>
        ))}
      </View>
    </View>
  )
}

export function WorkerV5OfferDetailEmptyCard({
  caseWideAura: CaseWideAura,
  jobIcon,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AuraComponent
  jobIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5AuraComponent
}) {
  return (
    <View style={[styles.offerDetailSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-offer-detail-summary-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="OfferDetailEmptySummary"
            style={styles.offerDetailSummaryAura}
            testID="worker-v5-offer-detail-summary-mint-aura"
          />
          <ZipAura
            scope="OfferDetailEmptySummaryFine"
            style={styles.offerDetailSummaryZipAura}
            testID="worker-v5-offer-detail-summary-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.offerDetailSummaryLine}>
        <View style={styles.offerDetailIconTile}>
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image resizeMode="contain" source={jobIcon} style={styles.offerDetailIcon} />
        </View>
        <View style={styles.offerDetailSummaryCopy}>
          <Text style={styles.offerDetailStatusChip} numberOfLines={1}>{textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')}</Text>
          <Text style={styles.offerDetailTitle} numberOfLines={2} testID="worker-v5-offer-summary-title">
            {textByLanguage(language, 'Chưa có đề nghị thật', 'No real offer yet')}
          </Text>
          <Text style={styles.offerDetailMeta} numberOfLines={2} testID="worker-v5-offer-summary-meta">
            {textByLanguage(language, 'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.', 'Details appear only after NestScout sends an opportunity to the worker.')}
          </Text>
        </View>
        <Text style={styles.offerDetailPrice} numberOfLines={2} testID="worker-v5-offer-summary-price">
          {textByLanguage(language, 'Chờ', 'Pending')}
        </Text>
      </View>
    </View>
  )
}

export function WorkerV5OfferDetailListCard({
  caseWideAura: CaseWideAura,
  iconSources,
  reduceTransparency,
  rows,
  scope,
  testID,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AuraComponent
  iconSources: Record<WorkerV5IconName, ImageSourcePropType>
  reduceTransparency: boolean
  rows: readonly WorkerV5OfferDetailRow[]
  scope: string
  testID: string
  zipAura: WorkerV5AuraComponent
}) {
  return (
    <View style={[styles.offerDetailListCard, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope={`${scope}Wide`} style={styles.offerDetailListAura} />
          <ZipAura scope={`${scope}Fine`} style={styles.offerDetailListZipAura} />
          <CaseWideAura
            scope={`${scope}Lower`}
            style={styles.offerDetailListLowerAura}
            testID={`${testID}-mint-aura`}
          />
        </>
      ) : null}
      {rows.map((row, index) => (
        <View key={`${row.title}-${row.status}`} style={[styles.offerDetailListRow, index > 0 && styles.offerDetailListDivider]}>
          <View style={styles.offerDetailRowIconTile}>
            <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
            <Image resizeMode="contain" source={iconSources[row.icon]} style={styles.offerDetailRowIcon} />
          </View>
          <View style={styles.offerDetailRowCopy}>
            <Text style={styles.offerDetailRowTitle} numberOfLines={2}>{row.title}</Text>
            <Text style={styles.offerDetailRowMeta} numberOfLines={2}>{row.meta}</Text>
          </View>
          <Text style={styles.offerDetailRowStatus} numberOfLines={1}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}
