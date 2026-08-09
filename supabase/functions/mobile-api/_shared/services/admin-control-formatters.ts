import { nullableString } from "./coercions.ts";
import type {
  AdminTransactionDetailResponse,
  AdminTransactionSummary,
  AdminWorkerApplicationSummary,
} from "../router/admin-control-dtos.ts";

type Row = Record<string, unknown>;

export function emptyRows() {
  return Promise.resolve({ data: [] as Row[], error: null });
}

export function matchesWorkerApplicationQuery(
  summary: AdminWorkerApplicationSummary,
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  return [
    summary.id,
    summary.worker_id,
    summary.full_name,
    summary.phone_masked,
    summary.contact_suffix,
    summary.source,
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}

export function matchesTransactionQuery(summary: AdminTransactionSummary, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return [
    summary.job_id,
    summary.display_code,
    summary.customer_name,
    summary.worker_name,
    summary.payment_status,
    summary.dispute_status,
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}

export function displayCodeFor(jobId: string) {
  return `NS-${jobId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function maskPhone(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

export function suffixOf(value: unknown) {
  const normalized = nullableString(value)?.trim() ?? "";
  return normalized ? normalized.slice(-6) : null;
}

export function timelineItem(
  key: AdminTransactionDetailResponse["timeline"][number]["key"],
  occurredAt: string | null,
) {
  return occurredAt ? { key, occurred_at: occurredAt, label_key: key } : null;
}

export function escapeLikePattern(value: string) {
  return value.replace(/[^\p{L}\p{N} -]/gu, "").trim();
}
