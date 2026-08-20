import type { WorkerV5ScreenId } from '../dock/types'

const workerJobsRebuildScreenIds = new Set<WorkerV5ScreenId>([
  '2.1-opportunity-inbox',
  '2.2-offer-detail',
  '2.3-customer-confirmation-wait',
  '2.4-route-eta',
  '2.7-in-progress',
  '2.8-scope-change',
  '2.9-approval-wait',
  '2.10-completion-evidence',
  '2.11-completion-submitted',
  '2.12-case-closed',
])

export function isWorkerJobsRebuildScreen(screenId: WorkerV5ScreenId) {
  return workerJobsRebuildScreenIds.has(screenId)
}
