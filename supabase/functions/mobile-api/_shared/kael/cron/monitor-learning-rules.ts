import {
  getLearningSkill,
  resolveLearningRuntimeConfig,
  shouldAutoRollbackLearningRule,
  type LearningSkillId,
} from "../skills/registry.ts";
import type { LearningQueueDbClient } from "./process-learning-queue.ts";

const MONITOR_WINDOW_DAYS = 30;
const MANUAL_REVIEW_SLA_DAYS = 3;

type LearningRuleRow = {
  id: string;
  rule_type: string;
  status: string;
  rollback_available: boolean;
};

type LearningApplicationRow = {
  rule_id: string | null;
  skill_id: string;
  applied_count: number | null;
  override_count: number | null;
  accuracy_delta: number | null;
  satisfaction_delta: number | null;
};

type LearningRuleMonitor = {
  skill_id: LearningSkillId;
  applied_count: number;
  override_count: number;
  accuracy_drop_pct: number;
  satisfaction_drop_pts: number;
  monitor_window_days: number;
};

export type MonitorLearningRulesSummary = {
  checked: number;
  monitored: number;
  rolled_back: number;
  loop_health?: LearningLoopHealthSummary;
  skipped_reason?: string;
  error_code?: string;
};

export type LearningLoopHealthSummary = {
  checked_at: string;
  manual_review_sla_days: number;
  manual_review_overdue_count: number;
  manual_review_overdue_ids: string[];
  failed_queue_count: number;
  failed_queue_ids: string[];
  failed_batch_count: number;
  failed_batch_ids: string[];
  error_codes: string[];
};

export async function monitorLearningRules(
  client: LearningQueueDbClient,
  options: { limit?: number; now?: Date } = {},
): Promise<MonitorLearningRulesSummary> {
  const runtimeConfig = resolveLearningRuntimeConfig(readRuntimeEnv);
  if (!runtimeConfig.enabled) {
    return { checked: 0, monitored: 0, rolled_back: 0, skipped_reason: "learning_disabled" };
  }
  if (!runtimeConfig.auto_rollback_enabled) {
    return { checked: 0, monitored: 0, rolled_back: 0, skipped_reason: "auto_rollback_disabled" };
  }
  if (!client.rpc) {
    return { checked: 0, monitored: 0, rolled_back: 0, error_code: "ROLLBACK_RPC_UNAVAILABLE" };
  }

  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - MONITOR_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();
  const rulesResult = await client
    .from("learning_rules")
    .select("id,rule_type,status,rollback_available")
    .eq("status", "active")
    .eq("rollback_available", true)
    .limit(options.limit ?? 50);
  if (rulesResult.error) {
    return {
      checked: 0,
      monitored: 0,
      rolled_back: 0,
      error_code: rulesResult.error.code ?? "DB_ERROR",
    };
  }

  const rules = Array.isArray(rulesResult.data)
    ? rulesResult.data.filter(isLearningRuleRow)
    : [];
  let monitored = 0;
  let rolledBack = 0;

  for (const rule of rules) {
    const samplesResult = await client
      .from("kael_rule_application_log")
      .select("rule_id,skill_id,applied_count,override_count,accuracy_delta,satisfaction_delta,created_at")
      .eq("rule_id", rule.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (samplesResult.error || !Array.isArray(samplesResult.data)) continue;

    const monitor = summarizeLearningMonitor(samplesResult.data);
    if (!monitor) continue;
    monitored += 1;
    const skill = getLearningSkill(monitor.skill_id);
    if (!skill) continue;
    if (!shouldAutoRollbackLearningRule(skill, monitor)) continue;

    const rollback = await client.rpc("rollback_learning_rule", {
      p_rule_id: rule.id,
      p_skill_id: monitor.skill_id,
      p_reason: "monitorLearningRules",
      p_safe_metadata: {
        monitor_window_days: monitor.monitor_window_days,
        applied_count: monitor.applied_count,
        override_count: monitor.override_count,
        accuracy_drop_pct: monitor.accuracy_drop_pct,
        satisfaction_drop_pts: monitor.satisfaction_drop_pts,
      },
    });
    if (rollback.error) continue;
    const row = Array.isArray(rollback.data)
      ? rollback.data.find(isRecord)
      : isRecord(rollback.data)
      ? rollback.data
      : null;
    if (row?.ok === true) {
      rolledBack += 1;
      await notifyAdminRuleRollback(client, rule.id, monitor);
    }
  }

  const loopHealth = await readLearningLoopHealth(client, now);

  return {
    checked: rules.length,
    monitored,
    rolled_back: rolledBack,
    loop_health: loopHealth,
  };
}

async function readLearningLoopHealth(
  client: LearningQueueDbClient,
  now: Date,
): Promise<LearningLoopHealthSummary> {
  const staleCutoff = new Date(now.getTime() - MANUAL_REVIEW_SLA_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();
  const [manualReview, failedQueue, failedBatches] = await Promise.all([
    client
      .from("learning_candidates")
      .select("id,status,created_at")
      .eq("status", "manual_review")
      .lte("created_at", staleCutoff)
      .limit(100),
    client
      .from("kael_learning_queue")
      .select("id,queue_state,error_code,updated_at")
      .eq("queue_state", "failed")
      .limit(100),
    client
      .from("kael_ai_batches")
      .select("id,status,error_code,updated_at")
      .eq("status", "failed")
      .limit(100),
  ]);
  const errorCodes = [
    manualReview.error?.code,
    failedQueue.error?.code,
    failedBatches.error?.code,
  ].filter((code): code is string => typeof code === "string" && code.length > 0);
  const manualReviewRows = Array.isArray(manualReview.data) ? manualReview.data : [];
  const failedQueueRows = Array.isArray(failedQueue.data) ? failedQueue.data : [];
  const failedBatchRows = Array.isArray(failedBatches.data) ? failedBatches.data : [];
  return {
    checked_at: now.toISOString(),
    manual_review_sla_days: MANUAL_REVIEW_SLA_DAYS,
    manual_review_overdue_count: manualReviewRows.length,
    manual_review_overdue_ids: idList(manualReviewRows),
    failed_queue_count: failedQueueRows.length,
    failed_queue_ids: idList(failedQueueRows),
    failed_batch_count: failedBatchRows.length,
    failed_batch_ids: idList(failedBatchRows),
    error_codes: errorCodes,
  };
}

async function notifyAdminRuleRollback(
  client: LearningQueueDbClient,
  ruleId: string,
  monitor: LearningRuleMonitor,
) {
  if (!client.rpc) return;
  const adminUserId = readRuntimeEnv("KAEL_LEARNING_ADMIN_USER_ID");
  if (!adminUserId) return;
  await Promise.resolve(client.rpc("insert_notification_atomic", {
    p_user_id: adminUserId,
    p_job_id: null,
    p_event_type: "kael_learning_rule_rolled_back",
    p_title: "Kael learning rollback",
    p_body: "A degraded Kael learning rule was rolled back.",
    p_safe_metadata: {
      rule_id: ruleId,
      skill_id: monitor.skill_id,
      monitor_window_days: monitor.monitor_window_days,
      accuracy_drop_pct: monitor.accuracy_drop_pct,
      satisfaction_drop_pts: monitor.satisfaction_drop_pts,
    },
  })).catch(() => undefined);
}

function summarizeLearningMonitor(rows: unknown[]): LearningRuleMonitor | null {
  const samples = rows.filter(isLearningApplicationRow);
  if (samples.length === 0) return null;
  const skillId = samples.find((sample) => isLearningSkillId(sample.skill_id))?.skill_id;
  if (!isLearningSkillId(skillId)) return null;
  const appliedCount = samples.reduce((total, sample) => total + integerFrom(sample.applied_count), 0);
  const overrideCount = samples.reduce((total, sample) => total + integerFrom(sample.override_count), 0);
  const accuracyDeltas = samples
    .map((sample) => numberFrom(sample.accuracy_delta))
    .filter((value): value is number => value !== null);
  const satisfactionDeltas = samples
    .map((sample) => numberFrom(sample.satisfaction_delta))
    .filter((value): value is number => value !== null);
  return {
    skill_id: skillId,
    applied_count: appliedCount,
    override_count: overrideCount,
    accuracy_drop_pct: roundMetric((average(accuracyDeltas) ?? 0) * 100),
    satisfaction_drop_pts: roundMetric(average(satisfactionDeltas) ?? 0),
    monitor_window_days: MONITOR_WINDOW_DAYS,
  };
}

function isLearningRuleRow(value: unknown): value is LearningRuleRow {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.rule_type === "string" &&
    typeof value.status === "string" &&
    typeof value.rollback_available === "boolean";
}

function isLearningApplicationRow(value: unknown): value is LearningApplicationRow {
  return isRecord(value) && typeof value.skill_id === "string";
}

function isLearningSkillId(value: unknown): value is LearningSkillId {
  return value === "LS1" ||
    value === "LS2" ||
    value === "LS3" ||
    value === "LS4" ||
    value === "LS5" ||
    value === "LS6" ||
    value === "LS7";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idList(rows: unknown[]): string[] {
  return rows
    .map((row) => isRecord(row) && typeof row.id === "string" ? row.id : null)
    .filter((id): id is string => id !== null)
    .slice(0, 10);
}

function numberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerFrom(value: unknown): number {
  const number = numberFrom(value);
  return number === null ? 0 : Math.max(0, Math.trunc(number));
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
}
