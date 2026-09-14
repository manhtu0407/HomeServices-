import { clockAnchor } from '../waiting-time'
import type { WaitingKind, WaitingModel } from '../waiting.types'
/** DEMO ONLY: 04:28 and 02:16 match the approved artwork, not any service SLA. */
export function createWaitingDemo(kind: WaitingKind): WaitingModel {
  const now = Date.now()
  return { kind, state: 'waiting', referenceCopy: true, clock: { requestKey: `DEMO-${kind}`, expiresAt: now + (kind === 'customer-confirmation' ? 268000 : 136000), anchor: clockAnchor(now) } }
}
