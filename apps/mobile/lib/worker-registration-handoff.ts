import type { WorkerApplicationStatus } from '@nestscout/shared'

export type WorkerHandoffApplication = Readonly<{
  applicationId: string | null
  reason: string | null
  status: WorkerApplicationStatus
}>

export type WorkerRegistrationHandoff =
  | Readonly<{ phase: 'registering'; identifier: string }>
  | Readonly<{ phase: 'failed'; identifier: string; error: string }>
  | Readonly<{ phase: 'submitted'; identifier: string; application: WorkerHandoffApplication }>
  | Readonly<{ phase: 'signing-in'; identifier: string }>
  | Readonly<{ phase: 'login-failed'; identifier: string; error: string }>
  | Readonly<{ phase: 'login-notice'; identifier: string; notice: string }>
  | Readonly<{ phase: 'pending'; identifier: string; application: WorkerHandoffApplication }>

// Signing up or in changes the session, and FrontendWorkflowProvider keys its whole subtree by
// session and role, so the auth screen is rebuilt mid-flow. Component state and refs die with it;
// this module-level record is what lets the rebuilt screen resume the worker flow instead of
// restarting at the role gate or treating the new customer-role session as a customer login.
let current: WorkerRegistrationHandoff | null = null
const listeners = new Set<() => void>()

export function getWorkerRegistrationHandoff() {
  return current
}

export function setWorkerRegistrationHandoff(next: WorkerRegistrationHandoff | null) {
  if (current === next) return
  current = next
  listeners.forEach((listener) => listener())
}

export function subscribeWorkerRegistrationHandoff(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
