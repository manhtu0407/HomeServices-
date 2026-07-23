import { type ServiceType } from "../../../_shared/domain.ts";
import { asServiceTypeArray } from "./coercions.ts";

type WorkerServicePreferenceSource = {
  active_service_types?: unknown;
  selected_service_types?: unknown;
  service_types?: unknown;
};

export function selectedServiceTypesForWorker(
  worker: WorkerServicePreferenceSource,
): ServiceType[] {
  const selected = asServiceTypeArray(worker.selected_service_types);
  if (selected.length > 0) return selected;

  const active = asServiceTypeArray(worker.active_service_types);
  if (active.length > 0) return active;
  return asServiceTypeArray(worker.service_types);
}

export function activeServiceTypesForWorker(
  worker: WorkerServicePreferenceSource,
): ServiceType[] {
  const selected = selectedServiceTypesForWorker(worker);
  const active = asServiceTypeArray(worker.active_service_types);
  if (active.length === 0) {
    return selected;
  }

  const selectedSet = new Set<ServiceType>(selected);
  return active.filter((service) =>
    selectedSet.has(service)
  );
}

export function workerAcceptsService(
  worker: WorkerServicePreferenceSource,
  serviceType: ServiceType,
) {
  return selectedServiceTypesForWorker(worker).includes(serviceType);
}

export function isWorkerServiceQualityLocked(
  quality: { is_locked?: unknown; locked_until?: unknown },
  nowMs = Date.now(),
) {
  if (quality.is_locked !== true || typeof quality.locked_until !== "string") {
    return false;
  }
  const lockedUntilMs = Date.parse(quality.locked_until);
  return Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs;
}
