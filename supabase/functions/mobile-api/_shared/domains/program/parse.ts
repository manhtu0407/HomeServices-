// Strict readers for the ambassador RPC payloads. A malformed number is a server fault, never
// a zero shown to a worker, so every reader fails the request instead of defaulting.

import { apiFailure } from "../../platform/api-failure.ts";
import { isRecord, nullableString } from "../../platform/coercions.ts";
import type {
  EdgeAdminAmbassadorProgramVersion,
  EdgeAmbassadorMilestone,
  EdgeAmbassadorMultiplierTier,
  EdgeAmbassadorPointEntry,
  EdgeAmbassadorPointEntryKind,
  EdgeAmbassadorProgram,
  EdgeAmbassadorRedemption,
} from "../contracts/ambassador.ts";

type Row = Record<string, unknown>;

const POINT_ENTRY_KINDS: readonly EdgeAmbassadorPointEntryKind[] = [
  "order_accrual",
  "accrual_reversal",
  "redemption",
  "penalty_debit",
  "penalty_forfeit",
  "appeal_restore",
  "admin_correction",
];

export function malformed(what: string): never {
  apiFailure("DB_ERROR", `Dữ liệu chương trình thưởng không hợp lệ (${what})`, 500);
}

export function requiredInteger(value: unknown, what: string): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) malformed(what);
  return number;
}

export function nullableInteger(value: unknown, what: string): number | null {
  return value === null || value === undefined ? null : requiredInteger(value, what);
}

export function requiredText(value: unknown, what: string): string {
  const text = nullableString(value);
  if (!text) malformed(what);
  return text;
}

export function recordArray(value: unknown, what: string): Row[] {
  if (!Array.isArray(value) || !value.every(isRecord)) malformed(what);
  return value;
}

function parseMilestone(row: Row): EdgeAmbassadorMilestone {
  return {
    id: requiredText(row.id, "milestone.id"),
    rank: requiredInteger(row.rank, "milestone.rank"),
    title_vi: requiredText(row.title_vi, "milestone.title_vi"),
    title_en: requiredText(row.title_en, "milestone.title_en"),
    points_required: requiredInteger(row.points_required, "milestone.points_required"),
    reward_vnd: requiredInteger(row.reward_vnd, "milestone.reward_vnd"),
  };
}

function parseMultiplier(row: Row): EdgeAmbassadorMultiplierTier {
  return {
    min_active_customers: requiredInteger(row.min_active_customers, "multiplier.min_active_customers"),
    multiplier_bps: requiredInteger(row.multiplier_bps, "multiplier.multiplier_bps"),
  };
}

export function parseProgram(value: unknown): EdgeAmbassadorProgram {
  if (!isRecord(value)) malformed("program");
  const status = value.status;
  if (status !== "draft" && status !== "approved" && status !== "retired") malformed("program.status");
  return {
    id: requiredText(value.id, "program.id"),
    version: requiredInteger(value.version, "program.version"),
    status,
    commission_vnd_per_point: requiredInteger(value.commission_vnd_per_point, "program.commission_vnd_per_point"),
    customer_vnd_per_point: requiredInteger(value.customer_vnd_per_point, "program.customer_vnd_per_point"),
    link_months: requiredInteger(value.link_months, "program.link_months"),
    network_window_days: requiredInteger(value.network_window_days, "program.network_window_days"),
    rebook_min_jobs: requiredInteger(value.rebook_min_jobs, "program.rebook_min_jobs"),
    invite_claim_days: requiredInteger(value.invite_claim_days, "program.invite_claim_days"),
    approved_at: nullableString(value.approved_at),
    updated_at: requiredText(value.updated_at, "program.updated_at"),
    milestones: recordArray(value.milestones, "program.milestones").map(parseMilestone),
    multipliers: recordArray(value.multipliers, "program.multipliers").map(parseMultiplier),
  };
}

export function parseAdminProgram(value: unknown): EdgeAdminAmbassadorProgramVersion | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) malformed("admin program");
  const violations = value.violations;
  if (!Array.isArray(violations) || !violations.every((item) => typeof item === "string")) {
    malformed("program.violations");
  }
  return {
    ...parseProgram(value),
    created_by: nullableString(value.created_by),
    approved_by: nullableString(value.approved_by),
    violations,
  };
}

export function parsePointEntry(row: Row): EdgeAmbassadorPointEntry {
  const kind = row.entry_kind;
  if (!POINT_ENTRY_KINDS.includes(kind as EdgeAmbassadorPointEntryKind)) malformed("entry.entry_kind");
  return {
    id: requiredText(row.id, "entry.id"),
    entry_kind: kind as EdgeAmbassadorPointEntryKind,
    points_milli: requiredInteger(row.points_milli, "entry.points_milli"),
    commission_basis_vnd: nullableInteger(row.commission_basis_vnd, "entry.commission_basis_vnd"),
    multiplier_bps: nullableInteger(row.multiplier_bps, "entry.multiplier_bps"),
    created_at: requiredText(row.created_at, "entry.created_at"),
  };
}

export function parseRedemption(row: Row): EdgeAmbassadorRedemption {
  return {
    id: requiredText(row.id, "redemption.id"),
    milestone_id: requiredText(row.milestone_id, "redemption.milestone_id"),
    reward_vnd: requiredInteger(row.reward_vnd, "redemption.reward_vnd"),
    tax_withheld_vnd: requiredInteger(row.tax_withheld_vnd, "redemption.tax_withheld_vnd"),
    net_vnd: requiredInteger(row.net_vnd, "redemption.net_vnd"),
    created_at: requiredText(row.created_at, "redemption.created_at"),
  };
}
