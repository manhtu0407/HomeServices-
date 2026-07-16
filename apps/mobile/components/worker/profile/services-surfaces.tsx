import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import type { ServiceType } from '@nestscout/shared'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { workerVerificationLabel } from '../ui/labels'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { styles } from './services-styles'

type WorkerV5ServicesProfile = WorkerProfileResponse | null | undefined
type WorkerV5SkillsHeroAura = ComponentType<{ testID: string }>
type WorkerV5SkillsListAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function workerV5ServiceDetailLabel(service: ServiceType, language: AppLanguage) {
  if (service === 'plumbing') return textByLanguage(language, 'Đường nước', 'Water systems')
  if (service === 'electrical') return textByLanguage(language, 'Thiết bị điện', 'Electrical systems')
  return textByLanguage(language, 'Không gian sống', 'Living spaces')
}

export function WorkerV5SkillsServiceHero({
  heroAura: _heroAura,
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
  const serviceCountLabel = profile
    ? textByLanguage(language, `${serviceCount} kỹ năng đang hoạt động`, `${serviceCount} active skills`)
    : textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-skills-service-hero">
      <View style={[styles.earningsHeroCopy, styles.skillsServiceHeroCopy]} testID="worker-v5-skills-hero-copy">
        <Text style={[styles.earningsHeroAmount, styles.skillsServiceHeroAmount]} numberOfLines={2} testID="worker-v5-skills-service-count">
          {serviceCountLabel}
        </Text>
        <WorkerV5DetailRail
          items={[
            {
              glyph: 'service',
              label: !profile
                ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
                : serviceCount
                  ? textByLanguage(language, `${serviceCount} dịch vụ`, `${serviceCount} services`)
                  : textByLanguage(language, 'Chưa có dịch vụ', 'No services yet'),
            },
            {
              glyph: 'location',
              label: !profile
                ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
                : profile.districts.length
                  ? textByLanguage(language, `${profile.districts.length} khu vực`, `${profile.districts.length} areas`)
                  : textByLanguage(language, 'Chưa có khu vực', 'No area yet'),
            },
          ]}
          prominent
          testID="worker-v5-skills-hero-detail"
        />
      </View>
      <WorkerV5IntegratedIcon bleed={16} edge="left" image={toolsIcon} reduceTransparency={reduceTransparency} tone="service" variant="heroPanel" />
    </View>
  )
}

export function WorkerV5ServiceCardGrid({
  language,
  listAura: _listAura,
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
          <WorkerV5IntegratedIcon bleed={11} edge="none" image={toolsIcon} reduceTransparency={reduceTransparency} style={styles.serviceSourceIntegratedIcon} tone="service" variant="stagePanel" />
          <View style={styles.serviceSourceCopy}>
            <Text style={styles.serviceSourceTitle} numberOfLines={2} testID="worker-v5-quick-action-empty-title">
              {profile
                ? textByLanguage(language, 'Chưa có kỹ năng đã ghi', 'No saved skills')
                : textByLanguage(language, 'Chờ dữ liệu kỹ năng', 'Skill data pending')}
            </Text>
            <Text style={styles.serviceSourceMeta} numberOfLines={2} testID="worker-v5-quick-action-empty-meta">
              {textByLanguage(language, 'Kỹ năng sẽ hiện khi hồ sơ thợ đồng bộ', 'Skills appear when the worker profile syncs')}
            </Text>
            <WorkerV5DetailRail
              items={[
                { glyph: 'sync', label: textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile') },
                { glyph: 'service', label: profile
                  ? textByLanguage(language, 'Chưa dùng để lọc', 'Not filtering yet')
                  : textByLanguage(language, 'Chờ nguồn thật', 'Waiting for real source') },
              ]}
              layout="stacked"
              testID="worker-v5-service-card-empty-detail"
            />
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
            <WorkerV5IntegratedIcon bleed={11} edge="none" image={serviceIcons[service]} reduceTransparency={reduceTransparency} style={styles.serviceSourceIntegratedIcon} tone="service" variant="stagePanel" />
            <View style={styles.serviceSourceCopy}>
              <Text style={styles.serviceSourceTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>
                {localizedServiceLabel(service, language)}
              </Text>
              <Text style={styles.serviceSourceMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>
                {workerVerificationLabel(profile?.verification_status, language)}
              </Text>
              <WorkerV5DetailRail
                items={[
                  { glyph: 'service', label: workerV5ServiceDetailLabel(service, language) },
                  { glyph: 'check', label: textByLanguage(language, 'Dùng để lọc việc', 'Used for matching') },
                ]}
                layout="stacked"
                testID={`worker-v5-service-card-detail-${index}`}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}
