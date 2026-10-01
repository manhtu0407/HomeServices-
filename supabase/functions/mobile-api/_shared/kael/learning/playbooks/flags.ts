import {
  KAEL_CASE_WORK_SERVICE_TYPES,
  type KaelCaseWorkServiceType,
} from "../performance-profiles.ts";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const DISABLED_VALUES = new Set(["0", "false", "no", "off"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSupportedServiceType(value: string): value is KaelCaseWorkServiceType {
  return KAEL_CASE_WORK_SERVICE_TYPES.includes(value as KaelCaseWorkServiceType);
}

export function kaelPlaybookFlagName(serviceType: string) {
  if (!isSupportedServiceType(serviceType)) return null;
  return `KAEL_PLAYBOOK_${serviceType.toUpperCase()}_ENABLED`;
}

export function kaelPlaybookCanaryFlagName(serviceType: string) {
  if (!isSupportedServiceType(serviceType)) return null;
  return `KAEL_PLAYBOOK_${serviceType.toUpperCase()}_CANARY_ENABLED`;
}

export function kaelPlaybookCanaryUserIdName(serviceType: string) {
  if (!isSupportedServiceType(serviceType)) return null;
  return `KAEL_PLAYBOOK_${serviceType.toUpperCase()}_CANARY_USER_ID`;
}

// A canary is authorized only for the authenticated actor passed by its caller.
// Never source actorId from request data. When the canary flag is enabled it
// narrows this service even if the legacy global service flag is also enabled.
export function isKaelPlaybookEnabled(
  serviceType: string,
  actorId?: string | null,
): boolean {
  const flagName = kaelPlaybookFlagName(serviceType);
  if (!flagName) return false;
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  const isEnabled = (value: string | undefined) =>
    typeof value === "string" && ENABLED_VALUES.has(value.trim().toLowerCase());
  const canaryFlagName = kaelPlaybookCanaryFlagName(serviceType);
  const canaryUserIdName = kaelPlaybookCanaryUserIdName(serviceType);
  const canaryValue = canaryFlagName
    ? deno?.env?.get?.(canaryFlagName)
    : undefined;

  if (typeof canaryValue === "string") {
    const normalizedCanaryValue = canaryValue.trim().toLowerCase();
    if (ENABLED_VALUES.has(normalizedCanaryValue)) {
      if (!canaryUserIdName) return false;
      const configuredUserId = deno?.env?.get?.(canaryUserIdName)?.trim();
      if (
        !actorId || !UUID_PATTERN.test(actorId) || !configuredUserId ||
        !UUID_PATTERN.test(configuredUserId)
      ) return false;
      return actorId.toLowerCase() === configuredUserId.toLowerCase();
    }
    if (!DISABLED_VALUES.has(normalizedCanaryValue)) return false;
  }

  return isEnabled(deno?.env?.get?.(flagName));
}
