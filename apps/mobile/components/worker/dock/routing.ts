import type { AppLanguage } from '@/lib/app-language'

import { getWorkerV5Screen } from './screens'
import type {
  WorkerDockActive,
  WorkerV5RouteParams,
  WorkerV5ScreenDefinition,
  WorkerV5ScreenId,
  WorkerV5Section,
} from './types'

const WORKER_JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validatedWorkerV5JobId(value?: string) {
  return value && WORKER_JOB_ID_PATTERN.test(value) ? value : null
}

export const workerV5Routes: Record<WorkerV5Section, string> = {
  earnings: '/(worker)/earnings',
  home: '/(worker)/home',
  jobs: '/(worker)/jobs',
  kael: '/(worker)/chat',
  profile: '/(worker)/profile',
}

export const workerV5SectionRootIds: Record<WorkerV5Section, WorkerV5ScreenId> = {
  earnings: '4.1-earnings-overview',
  home: '1.1-worker-home',
  jobs: '2.1-opportunity-inbox',
  kael: '3.1-kael-chat-normal',
  profile: '5.1-profile-overview',
}

export function firstRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function routeForWorkerV5Screen(
  screen: WorkerV5ScreenDefinition,
  params: WorkerV5RouteParams = {},
) {
  const query = [`ns_worker_screen=${encodeURIComponent(screen.id)}`]
  const auditRole = firstRouteParam(params.ns_audit_role)
  const jobId = validatedWorkerV5JobId(firstRouteParam(params.job_id))
  const language = firstRouteParam(params.ns_worker_lang)

  if (auditRole === 'worker') query.push('ns_audit_role=worker')
  if (jobId) query.push(`job_id=${encodeURIComponent(jobId)}`)
  if (language === 'en' || language === 'vi') {
    query.push(`ns_worker_lang=${language}`)
  }

  return `${workerV5Routes[screen.section]}?${query.join('&')}`
}

export function resolveWorkerV5ScreenId(section: WorkerV5Section, params: WorkerV5RouteParams): WorkerV5ScreenId {
  const explicitScreen = getWorkerV5Screen(firstRouteParam(params.ns_worker_screen))
  if (explicitScreen?.section === section) return explicitScreen.id

  if (section === 'jobs') return resolveWorkerV5JobsScreenId(params)
  if (section === 'earnings') return resolveWorkerV5EarningsScreenId(params)
  return workerV5SectionRootIds[section]
}

export function resolveWorkerV5DockActive(pathname: string, params: WorkerV5RouteParams): WorkerDockActive {
  const explicitScreen = getWorkerV5Screen(firstRouteParam(params.ns_worker_screen))
  if (explicitScreen) return explicitScreen.section

  if (pathname.includes('earnings')) return 'earnings'
  if (pathname.includes('profile')) return 'profile'
  if (pathname.includes('chat')) return 'kael'
  if (pathname.includes('jobs')) return 'jobs'
  return 'home'
}

export function resolveWorkerV5JobsScreenId(params: WorkerV5RouteParams): WorkerV5ScreenId {
  const auditSurface = firstRouteParam(params.ns_audit_surface)
  const tab = firstRouteParam(params.tab)

  if (auditSurface === 'worker_scope_change' || auditSurface === 'worker_scope_evidence_form') {
    return '2.8-scope-change'
  }

  if (auditSurface === 'worker_completion_evidence') return '2.10-completion-evidence'
  if (auditSurface === 'worker_job_summary' || auditSurface === 'worker_summary_report') {
    return '2.11-completion-submitted'
  }

  if (auditSurface === 'worker_case_closed' || auditSurface === 'worker_payment_gate') {
    return '2.12-case-closed'
  }

  if (auditSurface === 'worker_safety_checklist' || tab === 'active') return '2.7-in-progress'
  if (tab === 'waiting') return '2.1-opportunity-inbox'
  if (tab === 'needs') return '2.8-scope-change'
  return workerV5SectionRootIds.jobs
}

export function resolveWorkerV5EarningsScreenId(params: WorkerV5RouteParams): WorkerV5ScreenId {
  const paymentStep = firstRouteParam(params.ns_payment_step)

  if (paymentStep === 'withdraw') return '4.3-payout-request'
  if (paymentStep === 'method') return '4.4-payout-method'
  if (paymentStep === 'wallet') return '4.2-ledger-detail'
  return workerV5SectionRootIds.earnings
}

export function resolveWorkerV5Language(params: WorkerV5RouteParams): AppLanguage {
  const routeLanguage = firstRouteParam(params.ns_worker_lang)
  if (routeLanguage === 'en' || routeLanguage === 'vi') return routeLanguage
  return 'vi'
}
