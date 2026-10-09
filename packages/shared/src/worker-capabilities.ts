import type { ServiceType } from './constants'
import { WORKER_SERVICE_CAPABILITY_DATA } from './worker-capability-data'

export const WORKER_SERVICE_CAPABILITIES = WORKER_SERVICE_CAPABILITY_DATA satisfies Record<
  ServiceType,
  Record<string, readonly [string, string]>
>
