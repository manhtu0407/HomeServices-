import { type ImageSourcePropType } from 'react-native'
import { type CustomerServiceId, type ServiceType } from '@nestscout/shared'

type KaelCoreV9Visual = Readonly<{ kind: 'kael-core-v9' }>
export type CustomerV21Visual = ImageSourcePropType | KaelCoreV9Visual

const KAEL_CORE_V9_VISUAL: KaelCoreV9Visual = Object.freeze({ kind: 'kael-core-v9' })

export function isKaelCoreV9Visual(value: CustomerV21Visual): value is KaelCoreV9Visual {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'kael-core-v9'
}

export const customerV21Assets = {
  activity: require('@/assets/client-image-icons/client-activity-route.png') as ImageSourcePropType,
  historyErrorWorkart: require('@/assets/customer-history/history-error-workart.png') as ImageSourcePropType,
  // Same artwork cut out of its white background, so dark mode shows the objects alone.
  historyErrorWorkartDark: require('@/assets/customer-history/history-error-workart-dark.png') as ImageSourcePropType,
  activityNav: require('@/assets/client-image-icons/client-activity-nav.png') as ImageSourcePropType,
  address: require('@/assets/client-image-icons/client-address.png') as ImageSourcePropType,
  booking: require('@/assets/client-image-icons/client-booking.png') as ImageSourcePropType,
  bookingJourneyWorkart: require('@/assets/client-image-icons/client-booking-journey-workart-transparent-cropped.png') as ImageSourcePropType,
  clock: require('@/assets/worker-image-icons/utility-clock.png') as ImageSourcePropType,
  deleteAccount: require('@/assets/client-image-icons/client-delete-account-shredder.png') as ImageSourcePropType,
  evidence: require('@/assets/client-image-icons/client-evidence.png') as ImageSourcePropType,
  feedback: require('@/assets/client-image-icons/client-feedback.png') as ImageSourcePropType,
  home: require('@/assets/client-image-icons/client-home.png') as ImageSourcePropType,
  identity: require('@/assets/client-image-icons/client-identity.png') as ImageSourcePropType,
  kael: KAEL_CORE_V9_VISUAL,
  language: require('@/assets/client-image-icons/client-language.png') as ImageSourcePropType,
  auroraNestLogo: require('@/assets/nestscout-aurora-nest-appstore-1024.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/utility-map.png') as ImageSourcePropType,
  memory: require('@/assets/worker-image-icons/setting-kael-memory-core.png') as ImageSourcePropType,
  notification: require('@/assets/worker-image-icons/utility-bell.png') as ImageSourcePropType,
  password: require('@/assets/worker-image-icons/profile-verified.png') as ImageSourcePropType,
  payment: require('@/assets/client-image-icons/client-payment.png') as ImageSourcePropType,
  paymentBankTransfer: require('@/assets/client-image-icons/client-payment-bank-transfer.png') as ImageSourcePropType,
  paymentCard: require('@/assets/client-image-icons/client-payment-card.png') as ImageSourcePropType,
  phone: require('@/assets/client-image-icons/client-phone-v2.png') as ImageSourcePropType,
  privacy: require('@/assets/client-image-icons/client-privacy.png') as ImageSourcePropType,
  profile: require('@/assets/client-image-icons/client-profile.png') as ImageSourcePropType,
  rankingCompletion: require('@/assets/client-image-icons/client-ranking-process-completion.png') as ImageSourcePropType,
  rankingProtection: require('@/assets/client-image-icons/client-ranking-protected-payment.png') as ImageSourcePropType,
  rankingReview: require('@/assets/client-image-icons/client-ranking-quality-review.png') as ImageSourcePropType,
  request: require('@/assets/client-image-icons/client-request.png') as ImageSourcePropType,
  shield: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  serviceStart: require('@/assets/client-image-icons/client-service-start.png') as ImageSourcePropType,
  signOut: require('@/assets/client-image-icons/client-sign-out.png') as ImageSourcePropType,
  theme: require('@/assets/client-image-icons/client-theme.png') as ImageSourcePropType,
  tools: require('@/assets/worker-image-icons/utility-tools.png') as ImageSourcePropType,
  usageRankArt: require('@/assets/customer-usage-rank/usage-rank-art.png') as ImageSourcePropType,
  usageRankLeaf: require('@/assets/customer-usage-rank/usage-rank-leaf.png') as ImageSourcePropType,
  usageRankingWorkart: require('@/assets/client-image-icons/client-usage-ranking-workart.png') as ImageSourcePropType,
  wallet: require('@/assets/worker-image-icons/utility-wallet.png') as ImageSourcePropType,
} as const

export const customerV21BankAssets = {
  acb: require('@/assets/banks/acb.png') as ImageSourcePropType,
  bidv: require('@/assets/banks/bidv.png') as ImageSourcePropType,
  mbbank: require('@/assets/banks/mbbank.png') as ImageSourcePropType,
  techcombank: require('@/assets/banks/techcombank.png') as ImageSourcePropType,
  vietcombank: require('@/assets/banks/vietcombank.png') as ImageSourcePropType,
  vietinbank: require('@/assets/banks/vietinbank.png') as ImageSourcePropType,
} as const

export type CustomerV21BankKey = keyof typeof customerV21BankAssets

export const customerV21ServiceAssets: Record<ServiceType, ImageSourcePropType> = {
  cleaning: require('@/assets/client-image-icons/client-service-cleaning.png') as ImageSourcePropType,
  electrical: require('@/assets/client-image-icons/client-service-electrical.png') as ImageSourcePropType,
  handyman: require('./assets/service-icons/client-service-handyman-installation.png') as ImageSourcePropType,
  hvac: require('./assets/service-icons/client-service-hvac.png') as ImageSourcePropType,
  plumbing: require('@/assets/client-image-icons/client-service-plumbing.png') as ImageSourcePropType,
  upholstery: require('./assets/service-icons/client-service-upholstery-care.png') as ImageSourcePropType,
}

export const customerV21BookingServiceAssets: Record<CustomerServiceId, ImageSourcePropType> = {
  electrical: customerV21ServiceAssets.electrical,
  plumbing: customerV21ServiceAssets.plumbing,
  home_cleaning: customerV21ServiceAssets.cleaning,
  hvac_basic_maintenance: require('./assets/service-icons/client-service-hvac.png') as ImageSourcePropType,
  upholstery_care: require('./assets/service-icons/client-service-upholstery-care.png') as ImageSourcePropType,
  handyman_minor_installation: require('./assets/service-icons/client-service-handyman-installation.png') as ImageSourcePropType,
}

export const customerV21BookingWorkartAssets: Record<CustomerServiceId, ImageSourcePropType> = {
  electrical: require('@/assets/client-image-icons/client-booking-workart-electrical.png') as ImageSourcePropType,
  plumbing: require('@/assets/client-image-icons/client-booking-workart-plumbing.png') as ImageSourcePropType,
  home_cleaning: require('@/assets/client-image-icons/client-booking-workart-cleaning.png') as ImageSourcePropType,
  hvac_basic_maintenance: require('@/assets/client-image-icons/client-booking-workart-hvac.png') as ImageSourcePropType,
  upholstery_care: require('@/assets/client-image-icons/client-booking-workart-upholstery.png') as ImageSourcePropType,
  handyman_minor_installation: require('@/assets/client-image-icons/client-booking-workart-handyman.png') as ImageSourcePropType,
}

export const customerV21HomeV4Assets = {
  hero: require('@/assets/customer-home-v4/hero_scene.png') as ImageSourcePropType,
  promoWorker: require('@/assets/customer-home-v4/promo_worker.png') as ImageSourcePropType,
  services: {
    electrical: require('@/assets/customer-home-v4/service_electric.png') as ImageSourcePropType,
    plumbing: require('@/assets/customer-home-v4/service_water.png') as ImageSourcePropType,
    home_cleaning: require('@/assets/customer-home-v4/service_cleaning.png') as ImageSourcePropType,
    hvac_basic_maintenance: require('@/assets/customer-home-v4/service_air.png') as ImageSourcePropType,
    upholstery_care: require('@/assets/customer-home-v4/service_material.png') as ImageSourcePropType,
    handyman_minor_installation: require('@/assets/customer-home-v4/service_handyman.png') as ImageSourcePropType,
  } satisfies Record<CustomerServiceId, ImageSourcePropType>,
  currentJob: {
    electrical: require('@/assets/customer-home-v4/task_electrical_workart_384.png') as ImageSourcePropType,
    plumbing: require('@/assets/customer-home-v4/task_plumbing_workart_384.png') as ImageSourcePropType,
    home_cleaning: require('@/assets/customer-home-v4/task_cleaning.png') as ImageSourcePropType,
    hvac_basic_maintenance: require('@/assets/customer-home-v4/task_hvac_workart_384.png') as ImageSourcePropType,
    upholstery_care: require('@/assets/customer-home-v4/task_upholstery_workart_384.png') as ImageSourcePropType,
    handyman_minor_installation: require('@/assets/customer-home-v4/task_handyman_workart_384.png') as ImageSourcePropType,
  } satisfies Record<CustomerServiceId, ImageSourcePropType>,
  workarts: {
    electrical: require('@/assets/customer-home-v4/task_electrical_workart_384.png') as ImageSourcePropType,
    plumbing: require('@/assets/customer-home-v4/task_plumbing_workart_384.png') as ImageSourcePropType,
    home_cleaning: require('@/assets/customer-home-v4/task_cleaning_workart_384.png') as ImageSourcePropType,
    hvac_basic_maintenance: require('@/assets/customer-home-v4/task_hvac_workart_384.png') as ImageSourcePropType,
    upholstery_care: require('@/assets/customer-home-v4/task_upholstery_workart_384.png') as ImageSourcePropType,
    handyman_minor_installation: require('@/assets/customer-home-v4/task_handyman_workart_384.png') as ImageSourcePropType,
  } satisfies Record<CustomerServiceId, ImageSourcePropType>,
} as const
