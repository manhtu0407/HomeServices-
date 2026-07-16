import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import { type LocalDeal, type ServiceType } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { routeDestinationLabel } from '../ui/labels'
import { buildWorkerV5AcceptEtaSignal } from '../ui/route'
import type { WorkerV5AcceptCheck } from './acceptance'
import { styles } from './acceptance-styles'

type WorkerV5AcceptanceAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5AcceptSummaryCard({
  caseWideAura: CaseWideAura,
  deal,
  jobIcon,
  language,
  reduceTransparency,
  serviceIcons,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AcceptanceAuraComponent
  deal: LocalDeal | null
  jobIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  serviceIcons: Record<ServiceType, ImageSourcePropType>
  zipAura: WorkerV5AcceptanceAuraComponent
}) {
  const serviceType = deal?.draft.serviceType ?? null
  const serviceIcon = serviceType ? serviceIcons[serviceType] : jobIcon
  const serviceLabel = deal
    ? localizedServiceLabel(deal.draft.serviceType, language)
    : textByLanguage(language, 'Chưa có đề nghị thật', 'No real offer yet')
  const meta = deal
    ? `${deal.draft.description || textByLanguage(language, 'Yêu cầu từ khách', 'Customer request')} · ${routeDestinationLabel(deal, language)}`
    : textByLanguage(language, 'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.', 'Details appear only after NestScout sends an opportunity to the worker.')
  const earning = deal?.broadcast?.estimatedEarningLabel?.trim()
    || textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning estimate')

  return (
    <View style={[styles.acceptSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-summary-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="AcceptSummaryWide"
            style={styles.acceptSummaryAura}
            testID="worker-v5-accept-summary-mint-aura"
          />
          <ZipAura
            scope="AcceptSummaryFine"
            style={styles.acceptSummaryZipAura}
            testID="worker-v5-accept-summary-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.acceptSummaryLine}>
        <View style={styles.acceptSummaryIconTile} testID="worker-v5-accept-summary-icon-tile">
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image contentFit="contain" source={serviceIcon} style={styles.acceptSummaryIcon} />
        </View>
        <View style={styles.acceptSummaryCopy} testID="worker-v5-accept-summary-copy">
          <Text style={styles.acceptSummaryTitle} numberOfLines={2} testID="worker-v5-accept-summary-title">{serviceLabel}</Text>
          <Text style={styles.acceptSummaryMeta} numberOfLines={2} testID="worker-v5-accept-summary-meta">{meta}</Text>
        </View>
        <View style={styles.acceptSummaryPriceSlot} testID="worker-v5-accept-summary-price-slot">
          <Text style={styles.acceptSummaryPrice} numberOfLines={2} testID="worker-v5-accept-summary-price">{earning}</Text>
        </View>
      </View>
    </View>
  )
}

export function WorkerV5AcceptChecklistCard({
  caseWideAura: CaseWideAura,
  checks,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AcceptanceAuraComponent
  checks: readonly WorkerV5AcceptCheck[]
  reduceTransparency: boolean
  zipAura: WorkerV5AcceptanceAuraComponent
}) {
  return (
    <View style={[styles.acceptChecklistCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-checklist-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="AcceptChecklistWide"
            style={styles.acceptChecklistAura}
            testID="worker-v5-accept-checklist-mint-aura"
          />
          <ZipAura scope="AcceptChecklistFine" style={styles.acceptChecklistZipAura} />
        </>
      ) : null}
      {checks.map((check, index) => (
        <View key={check.label} style={[styles.acceptCheckRow, index > 0 && styles.acceptCheckRowGap]} testID={`worker-v5-accept-check-${index}`}>
          {!reduceTransparency ? (
            <ZipAura
              scope={`AcceptCheckRow${index}`}
              style={styles.acceptCheckRowAura}
              testID={`worker-v5-accept-check-row-mint-aura-${index}`}
            />
          ) : null}
          <View style={[
            styles.acceptCheckState,
            check.state === 'done' && styles.acceptCheckStateDone,
            check.state === 'blocked' && styles.acceptCheckStateBlocked,
          ]}>
            <Text style={[styles.acceptCheckStateText, check.state === 'done' && styles.acceptCheckStateTextDone]}>
              {check.state === 'done' ? '✓' : '!'}
            </Text>
          </View>
          <Text style={styles.acceptCheckLabel} numberOfLines={2}>{check.label}</Text>
          <Text style={styles.acceptCheckMeta} numberOfLines={2}>{check.meta}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5AcceptCommitmentCard({
  caseWideAura: CaseWideAura,
  clockIcon,
  deal,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AcceptanceAuraComponent
  clockIcon: ImageSourcePropType
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5AcceptanceAuraComponent
}) {
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)

  return (
    <View style={[styles.acceptCommitmentCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-commitment">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="AcceptCommitmentWide" style={styles.acceptCommitmentAura} />
          <ZipAura scope="AcceptCommitmentFine" style={styles.acceptCommitmentZipAura} />
        </>
      ) : null}
      <View style={styles.acceptCommitmentIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image contentFit="contain" source={clockIcon} style={styles.acceptCommitmentIcon} />
      </View>
      <View style={styles.acceptCommitmentCopy}>
        <Text style={styles.acceptCommitmentTitle} numberOfLines={2} testID="worker-v5-accept-commitment-title">
          {etaSignal.label}
        </Text>
        {etaSignal.hasSignal ? (
          <Text style={styles.acceptCommitmentMeta} numberOfLines={3} testID="worker-v5-accept-commitment-meta">
            {etaSignal.meta}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function WorkerV5AcceptBoundaryNote({
  caseWideAura: CaseWideAura,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5AcceptanceAuraComponent
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5AcceptanceAuraComponent
}) {
  return (
    <View style={[styles.acceptBoundaryNote, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-boundary-note">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="AcceptBoundaryWide"
            style={styles.acceptBoundaryAura}
            testID="worker-v5-accept-boundary-mint-aura"
          />
          <ZipAura scope="AcceptBoundaryFine" style={styles.acceptBoundaryZipAura} />
        </>
      ) : null}
      <Text style={styles.acceptBoundaryText}>
        <Text style={styles.acceptBoundaryStrong}>
          {textByLanguage(language, 'Kael không thể bấm nhận thay bạn.', 'Kael cannot accept on your behalf.')}
        </Text>
        {textByLanguage(language, ' Nút dưới tạo sự kiện xác nhận rõ của thợ.', ' The button below creates an explicit worker confirmation event.')}
      </Text>
    </View>
  )
}
