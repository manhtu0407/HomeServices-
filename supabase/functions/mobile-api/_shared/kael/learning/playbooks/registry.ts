import type { KaelCaseWorkServiceType } from "../performance-profiles.ts";
import { CLEANING_PLAYBOOK_SEGMENT, CLEANING_PLAYBOOK_VERSION } from "./cleaning.ts";
import { ELECTRICAL_PLAYBOOK_SEGMENT, ELECTRICAL_PLAYBOOK_VERSION } from "./electrical.ts";
import { isKaelPlaybookEnabled } from "./flags.ts";
import { HANDYMAN_PLAYBOOK_SEGMENT, HANDYMAN_PLAYBOOK_VERSION } from "./handyman.ts";
import { HVAC_PLAYBOOK_SEGMENT, HVAC_PLAYBOOK_VERSION } from "./hvac.ts";
import { PLUMBING_PLAYBOOK_SEGMENT, PLUMBING_PLAYBOOK_VERSION } from "./plumbing.ts";
import { UPHOLSTERY_PLAYBOOK_SEGMENT, UPHOLSTERY_PLAYBOOK_VERSION } from "./upholstery.ts";

export type KaelPlaybookDefinition = {
  readonly serviceType: KaelCaseWorkServiceType;
  readonly version: string;
  readonly segment: string;
};

const PLAYBOOK_REGISTRY: Partial<Record<KaelCaseWorkServiceType, KaelPlaybookDefinition>> = {
  electrical: Object.freeze({
    serviceType: "electrical",
    version: ELECTRICAL_PLAYBOOK_VERSION,
    segment: ELECTRICAL_PLAYBOOK_SEGMENT,
  }),
  plumbing: Object.freeze({
    serviceType: "plumbing",
    version: PLUMBING_PLAYBOOK_VERSION,
    segment: PLUMBING_PLAYBOOK_SEGMENT,
  }),
  cleaning: Object.freeze({
    serviceType: "cleaning",
    version: CLEANING_PLAYBOOK_VERSION,
    segment: CLEANING_PLAYBOOK_SEGMENT,
  }),
  hvac: Object.freeze({
    serviceType: "hvac",
    version: HVAC_PLAYBOOK_VERSION,
    segment: HVAC_PLAYBOOK_SEGMENT,
  }),
  upholstery: Object.freeze({
    serviceType: "upholstery",
    version: UPHOLSTERY_PLAYBOOK_VERSION,
    segment: UPHOLSTERY_PLAYBOOK_SEGMENT,
  }),
  handyman: Object.freeze({
    serviceType: "handyman",
    version: HANDYMAN_PLAYBOOK_VERSION,
    segment: HANDYMAN_PLAYBOOK_SEGMENT,
  }),
};

export function getKaelPlaybook(serviceType: string): KaelPlaybookDefinition | null {
  if (!Object.hasOwn(PLAYBOOK_REGISTRY, serviceType)) return null;
  return PLAYBOOK_REGISTRY[serviceType as KaelCaseWorkServiceType] ?? null;
}

export function getKaelPlaybookVersion(serviceType: string): string | null {
  return getKaelPlaybook(serviceType)?.version ?? null;
}

export function getEnabledKaelPlaybook(
  serviceType: string,
  actorId?: string | null,
): KaelPlaybookDefinition | null {
  const playbook = getKaelPlaybook(serviceType);
  return playbook && isKaelPlaybookEnabled(serviceType, actorId) ? playbook : null;
}

export { isKaelPlaybookEnabled } from "./flags.ts";
