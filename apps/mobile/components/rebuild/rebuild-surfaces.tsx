import type { ReactNode } from 'react'
import type { WorkerDockActive } from '../worker/worker-surfaces'

// Legacy rebuild import path kept as a compatibility shim.
// Stale imports must resolve to the current customer/worker surfaces, never the old rebuild UI.
export {
  CustomerBookingEntrySurface,
  CustomerHistorySurface,
  CustomerHomeSurface,
  CustomerKaelSurface,
  CustomerProfileSurface,
  CustomerV4DockOverlay,
} from '../customer/customer-surfaces'
export type { CustomerDockActive } from '../customer/customer-surfaces'
export {
  WorkerChatSurface,
  WorkerEarningsSurface,
  WorkerHomeSurface,
  WorkerJobsSurface,
  WorkerProfileSurface,
} from '../worker/worker-surfaces'
export type { WorkerDockActive } from '../worker/worker-surfaces'

export function WorkerDockLayoutProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function WorkerRebuildDockOverlay(_props: { active: WorkerDockActive }) {
  return null
}
