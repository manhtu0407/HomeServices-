import {
  KAEL_CASE_WORK_SERVICE_TYPES,
  type KaelCaseWorkServiceType,
} from "../performance-profiles.ts";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function isSupportedServiceType(value: string): value is KaelCaseWorkServiceType {
  return KAEL_CASE_WORK_SERVICE_TYPES.includes(value as KaelCaseWorkServiceType);
}

export function kaelPlaybookFlagName(serviceType: string) {
  if (!isSupportedServiceType(serviceType)) return null;
  return `KAEL_PLAYBOOK_${serviceType.toUpperCase()}_ENABLED`;
}

export function isKaelPlaybookEnabled(serviceType: string): boolean {
  const flagName = kaelPlaybookFlagName(serviceType);
  if (!flagName) return false;
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  const value = deno?.env?.get?.(flagName);
  return typeof value === "string" && ENABLED_VALUES.has(value.trim().toLowerCase());
}
