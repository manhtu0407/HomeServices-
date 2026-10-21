// Request-local safety metadata is registered only after customer authorization and Case ownership.
import { readKaelEmergencyGuidance, type EdgeEmergencyGuidancePayload } from '../../../_shared/contracts/emergency-guidance.ts';

const guidance = new WeakMap<object, EdgeEmergencyGuidancePayload>();

export function clearRequestEmergencyGuidance(ctx: object): void { guidance.delete(ctx); }

export function setRequestEmergencyGuidance(ctx: object, value: unknown): void {
  const parsed = readKaelEmergencyGuidance(value);
  if (parsed) guidance.set(ctx, parsed);
}

export function requestEmergencyFields(ctx?: object | null): { emergency?: EdgeEmergencyGuidancePayload } {
  const value = ctx ? guidance.get(ctx) : undefined;
  return value ? { emergency: { ...value } } : {};
}
