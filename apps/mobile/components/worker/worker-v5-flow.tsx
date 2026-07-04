// Legacy worker V5 import path kept as a compatibility shim.
// If any stale path still imports it, it receives the current split worker surfaces.
export {
  WorkerChatSurface,
  WorkerEarningsSurface,
  WorkerHomeSurface,
  WorkerJobsSurface,
  WorkerProfileSurface,
} from './worker-surfaces'
export type { WorkerDockActive } from './worker-surfaces'
