import { type ImageSourcePropType } from 'react-native'
import { type ServiceType } from '@nestscout/shared'

export const customerV21Assets = {
  activity: require('@/assets/client-image-icons/client-activity.png') as ImageSourcePropType,
  address: require('@/assets/client-image-icons/client-address.png') as ImageSourcePropType,
  booking: require('@/assets/client-image-icons/client-booking.png') as ImageSourcePropType,
  clock: require('@/assets/worker-image-icons/utility-clock.png') as ImageSourcePropType,
  evidence: require('@/assets/client-image-icons/client-evidence.png') as ImageSourcePropType,
  feedback: require('@/assets/client-image-icons/client-feedback.png') as ImageSourcePropType,
  home: require('@/assets/client-image-icons/client-home.png') as ImageSourcePropType,
  identity: require('@/assets/client-image-icons/client-identity.png') as ImageSourcePropType,
  kael: require('@/assets/kael-orb-icon.png') as ImageSourcePropType,
  kaelHead: require('@/assets/kael-emotions/kael-emotion-focused.png') as ImageSourcePropType,
  kaelFull: require('@/assets/kael-states/kael-state-welcome.png') as ImageSourcePropType,
  kaelNavigation: require('@/assets/navigation/customer/kael.png') as ImageSourcePropType,
  language: require('@/assets/client-image-icons/client-language.png') as ImageSourcePropType,
  logout: require('@/assets/client-image-icons/client-logout-v2.png') as ImageSourcePropType,
  auroraNestLogo: require('@/assets/nestscout-aurora-nest-appstore-1024.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/utility-map.png') as ImageSourcePropType,
  memory: require('@/assets/client-image-icons/client-privacy.png') as ImageSourcePropType,
  notification: require('@/assets/worker-image-icons/utility-bell.png') as ImageSourcePropType,
  payment: require('@/assets/client-image-icons/client-payment.png') as ImageSourcePropType,
  paymentBankTransfer: require('@/assets/client-image-icons/client-payment-bank-transfer.png') as ImageSourcePropType,
  paymentCard: require('@/assets/client-image-icons/client-payment-card.png') as ImageSourcePropType,
  phone: require('@/assets/client-image-icons/client-phone-v2.png') as ImageSourcePropType,
  privacy: require('@/assets/client-image-icons/client-privacy.png') as ImageSourcePropType,
  profile: require('@/assets/client-image-icons/client-profile.png') as ImageSourcePropType,
  request: require('@/assets/client-image-icons/client-request.png') as ImageSourcePropType,
  shield: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  theme: require('@/assets/client-image-icons/client-theme.png') as ImageSourcePropType,
  tools: require('@/assets/worker-image-icons/utility-tools.png') as ImageSourcePropType,
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
  plumbing: require('@/assets/client-image-icons/client-service-plumbing.png') as ImageSourcePropType,
}
