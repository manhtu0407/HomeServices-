import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import type { ServiceType } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { workerVerificationLabel } from '../ui/labels'
import { styles } from './services-styles'

type WorkerV5ServicesProfile = WorkerProfileResponse | null | undefined
type WorkerV5SkillsHeroAura = ComponentType<{ testID: string }>
type WorkerV5SkillsListAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SkillsServiceHero({
  heroAura: HeroAura,
  language,
  profile,
  reduceTransparency,
  toolsIcon,
}: {
  heroAura: WorkerV5SkillsHeroAura
  language: AppLanguage
  profile: WorkerV5ServicesProfile
  reduceTransparency: boolean
  toolsIcon: ImageSourcePropType
}) {
  const serviceCount = profile?.service_types?.length ?? 0
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-skills-service-hero">
      {!reduceTransparency ? <HeroAura testID="worker-v5-skills-service-mint-aura" /> : null}
      <View style={styles.earningsHeroCopy}>
        <Text style={[styles.earningsHeroAmount, styles.skillsServiceHeroAmount]} numberOfLines={2} testID="worker-v5-skills-service-count">
          {textByLanguage(language, `${serviceCount} kỹ năng đang hoạt động`, `${serviceCount} active skills`)}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Chỉ hiển thị dữ liệu sử dụng trực tiếp trong workflow.', 'Only data used directly by the workflow is shown.')}</Text>
      </View>
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={toolsIcon} style={styles.earningsHeroIcon} />
      </View>
    </View>
  )
}

export function WorkerV5ServiceCardGrid({
  language,
  listAura: ListAura,
  profile,
  reduceTransparency,
  serviceIcons,
  toolsIcon,
}: {
  language: AppLanguage
  listAura: WorkerV5SkillsListAura
  profile: WorkerV5ServicesProfile
  reduceTransparency: boolean
  serviceIcons: Record<ServiceType, ImageSourcePropType>
  toolsIcon: ImageSourcePropType
}) {
  const registeredServices = profile?.service_types ?? []
  if (!registeredServices.length) {
    return (
      <View style={styles.serviceCardGrid} testID="worker-v5-quick-action-grid">
        <View style={[styles.serviceSourceCard, styles.serviceSourceCardFull, reduceTransparency && styles.opaqueCard]} testID="worker-v5-quick-action-empty">
          {!reduceTransparency ? <ListAura testID="worker-v5-service-card-mint-aura-empty" /> : null}
          <View style={styles.serviceSourceIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={toolsIcon} style={styles.serviceSourceIcon} />
          </View>
          <View style={styles.serviceSourceCopy}>
            <Text style={styles.serviceSourceTitle} numberOfLines={2} testID="worker-v5-quick-action-empty-title">
              {textByLanguage(language, 'Chưa có kỹ năng đã ghi', 'No saved skills')}
            </Text>
            <Text style={styles.serviceSourceMeta} numberOfLines={2} testID="worker-v5-quick-action-empty-meta">
              {textByLanguage(language, 'Kỹ năng sẽ hiện khi hồ sơ thợ đồng bộ', 'Skills appear when the worker profile syncs')}
            </Text>
          </View>
        </View>
      </View>
    )
  }
  return (
    <View style={styles.serviceCardGrid} testID="worker-v5-quick-action-grid">
      {registeredServices.map((service, index) => {
        return (
          <View
            key={service}
            style={[
              styles.serviceSourceCard,
              registeredServices.length === 1 ? styles.serviceSourceCardFull : null,
              registeredServices.length === 2 ? styles.serviceSourceCardHalf : null,
              styles.serviceSourceCardSelected,
              reduceTransparency && styles.opaqueCard,
            ]}
            testID={`worker-v5-quick-action-${index}`}
          >
            {!reduceTransparency ? <ListAura testID={`worker-v5-service-card-mint-aura-${index}`} /> : null}
            <View style={styles.serviceSourceIconTile}>
              {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
              <Image resizeMode="contain" source={serviceIcons[service]} style={styles.serviceSourceIcon} />
            </View>
            <View style={styles.serviceSourceCopy}>
              <Text style={styles.serviceSourceTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>
                {localizedServiceLabel(service, language)}
              </Text>
              <Text style={styles.serviceSourceMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>
                {workerVerificationLabel(profile?.verification_status, language)}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}
