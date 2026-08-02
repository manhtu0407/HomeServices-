export type CustomerV21ScreenId =
  | '2.1-home'
  | '2.2-search'
  | '2.3-media'
  | '2.4-chat-normal'
  | '2.5-chat-case'
  | '2.6-case-overview'
  | '2.7-matching'
  | '2.8-options'
  | '2.9-quotes'
  | '3.1-payment-review'
  | '3.2-payment-method'
  | '3.3-payment-protected'
  | '2.10-location-eta'
  | '2.11-live-alert'
  | '2.12-job-accepted'
  | '2.13-job-progress'
  | '6.1-profile-overview'
  | '6.2-usage-ranking'
  | '6.3-protect-money'

export type CustomerPrimaryTab = 'home' | 'services' | 'activity' | 'profile'

export type CustomerKaelMode = 'normal' | 'case'

type CustomerV21DockActive = CustomerPrimaryTab | 'chat'
export type CustomerDockActive = CustomerV21DockActive

export const customerV21ProfileStageIds: CustomerV21ScreenId[] = ['6.1-profile-overview', '6.2-usage-ranking', '6.3-protect-money']
