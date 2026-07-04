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
import type { LocalDeal } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { canShowWorkerAddress } from '../ui/labels'
import {
  buildWorkerV5CheckInChecklistItems,
  workerV5ArrivalDestinationLabel,
  workerV5ArrivalDestinationMeta,
  workerV5CustomerContactInfo,
} from '../ui/route'
import { textByLanguage } from '../ui/format'
import { styles } from './checkin-styles'

type WorkerV5CheckInAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5CheckInHero({
  caseWideAura: CaseWideAura,
  deal,
  language,
  mapIcon,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CheckInAuraComponent
  deal: LocalDeal | null
  language: AppLanguage
  mapIcon: ImageSourcePropType
  reduceTransparency: boolean
  zipAura: WorkerV5CheckInAuraComponent
}) {
  const addressOpen = deal ? canShowWorkerAddress(deal) : false
  const destinationLabel = workerV5ArrivalDestinationLabel(deal, language)
  const destinationMeta = workerV5ArrivalDestinationMeta(deal, language)
  return (
    <View style={[styles.checkInHero, reduceTransparency && styles.opaqueCard]} testID="worker-v5-checkin-hero">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="ArrivalCheckinHeroWide"
            style={styles.checkInHeroAura}
            testID="worker-v5-checkin-mint-aura"
          />
          <ZipAura
            scope="ArrivalCheckinHeroFine"
            style={styles.checkInHeroZipAura}
            testID="worker-v5-checkin-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.checkInIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={mapIcon} style={styles.checkInIcon} />
      </View>
      <View style={styles.checkInTextColumn}>
        <Text style={styles.checkInKicker}>{addressOpen ? textByLanguage(language, 'Địa chỉ đã mở', 'Address open') : textByLanguage(language, 'Điểm đến bảo vệ', 'Protected destination')}</Text>
        <Text style={styles.checkInTitle} numberOfLines={1} testID="worker-v5-checkin-destination-title">{destinationLabel}</Text>
        <Text style={styles.checkInTitleMeta} numberOfLines={2} testID="worker-v5-checkin-destination-meta">{destinationMeta}</Text>
      </View>
    </View>
  )
}

export function WorkerV5CustomerContactCard({
  caseWideAura: CaseWideAura,
  chatIcon,
  deal,
  language,
  phoneIcon,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CheckInAuraComponent
  chatIcon: ImageSourcePropType
  deal: LocalDeal | null
  language: AppLanguage
  phoneIcon: ImageSourcePropType
  reduceTransparency: boolean
  zipAura: WorkerV5CheckInAuraComponent
}) {
  const customerContact = workerV5CustomerContactInfo(deal, language)
  const showContactIcons = Boolean(deal)
  return (
    <View style={[styles.contactCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-customer-contact-card">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="ArrivalCustomerWide" style={styles.contactListAura} />
          <ZipAura scope="ArrivalCustomerFine" style={styles.contactListZipAura} />
        </>
      ) : null}
      <View style={styles.contactIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={chatIcon} style={styles.contactIcon} />
      </View>
      <View style={styles.contactText}>
        <Text style={styles.contactTitle} numberOfLines={2} testID="worker-v5-customer-contact-title">{customerContact.title}</Text>
        <Text style={styles.contactBody} numberOfLines={2} testID="worker-v5-customer-contact-meta">{customerContact.meta}</Text>
      </View>
      {showContactIcons ? (
        <View style={styles.contactIconRow} testID="worker-v5-customer-contact-icons">
          <View style={styles.contactMiniIcon}>
            <Image resizeMode="contain" source={phoneIcon} style={styles.contactMiniIconImage} />
          </View>
          <View style={styles.contactMiniIcon}>
            <Image resizeMode="contain" source={chatIcon} style={styles.contactMiniIconImage} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

export function WorkerV5CheckInChecklist({
  caseWideAura: CaseWideAura,
  deal,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CheckInAuraComponent
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5CheckInAuraComponent
}) {
  const items = buildWorkerV5CheckInChecklistItems(deal, language)
  return (
    <View style={[styles.checkInChecklist, reduceTransparency && styles.opaqueCard]} testID="worker-v5-checkin-checklist">
      {!reduceTransparency ? (
        <>
          <CaseWideAura
            scope="ArrivalChecklistWide"
            style={styles.checkInChecklistAura}
            testID="worker-v5-checkin-checklist-mint-aura"
          />
          <ZipAura
            scope="ArrivalChecklistFine"
            style={styles.checkInChecklistZipAura}
            testID="worker-v5-checkin-checklist-zip-mint-aura"
          />
        </>
      ) : null}
      {items.map((item, index) => (
        <View key={item.label} style={styles.checkInRow}>
          <View style={[
            styles.checkInState,
            item.state === 'done' ? styles.checkInStateDone : null,
            item.state === 'active' ? styles.checkInStateActive : null,
          ]}>
            <Text style={[styles.checkInStateText, item.state === 'done' ? styles.checkInStateTextOn : null]}>
              {item.state === 'done' ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={styles.checkInLabel} numberOfLines={2} testID={`worker-v5-checkin-label-${index}`}>{item.label}</Text>
          <Text style={styles.checkInMeta} numberOfLines={1} testID={`worker-v5-checkin-meta-${index}`}>{item.meta}</Text>
        </View>
      ))}
    </View>
  )
}
