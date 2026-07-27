import type { AppLanguage } from '@/lib/app-language'

export type WorkerDockActive = 'earnings' | 'home' | 'jobs' | 'kael' | 'profile'

export type WorkerV5Section = 'earnings' | 'home' | 'jobs' | 'kael' | 'profile'
export type WorkerV5Phase = 'accept' | 'approval' | 'assist' | 'close' | 'complete' | 'discover' | 'execute' | 'grow' | 'money' | 'prepare' | 'profile' | 'settle' | 'travel' | 'work'
export type WorkerV5IconName =
  | 'calendar'
  | 'camera'
  | 'chat'
  | 'clock'
  | 'document'
  | 'earnings'
  | 'evidence'
  | 'home'
  | 'jobs'
  | 'map'
  | 'profile'
  | 'shield'
  | 'scope'
  | 'tools'
  | 'wallet'

export type WorkerV5ScreenId =
  | '1.1-worker-home'
  | '2.1-opportunity-inbox'
  | '2.2-offer-detail'
  | '2.3-customer-confirmation-wait'
  | '2.4-route-eta'
  | '2.7-in-progress'
  | '2.8-scope-change'
  | '2.9-approval-wait'
  | '2.10-completion-evidence'
  | '2.11-completion-submitted'
  | '2.12-case-closed'
  | '3.1-kael-chat-normal'
  | '3.2-kael-job-intake'
  | '4.1-earnings-overview'
  | '4.2-ledger-detail'
  | '4.3-payout-request'
  | '4.4-payout-method'
  | '5.1-profile-overview'
  | '5.2-worker-ranking'
  | '5.3-skills-service-area'
  | '5.4-reliability-insights'
  | '5.5-account-utilities'
  | '5.6-agent-memory-preferences'
  | '5.7-verification-documents'
  | '5.8-bank-tax-center'
  | '5.9-reviews-feedback'
  | '5.10-support-settings'

export type WorkerV5ScreenDefinition = {
  authority: string
  guardrail: string
  icon: WorkerV5IconName
  id: WorkerV5ScreenId
  order: number
  phase: WorkerV5Phase
  primaryNext?: string
  section: WorkerV5Section
  title: Record<AppLanguage, string>
}

export type WorkerV5RouteParams = {
  job_id?: string | string[]
  ns_arrival_gate?: string | string[]
  ns_audit_role?: string | string[]
  ns_audit_surface?: string | string[]
  ns_payment_step?: string | string[]
  ns_scope_mode?: string | string[]
  ns_worker_lang?: string | string[]
  ns_worker_screen?: string | string[]
  tab?: string | string[]
}
