import type { ServiceType } from "../types.ts";

export type NormalTransactionPhaseName =
  | "INTAKE"
  | "CONFIRM"
  | "MATCH"
  | "EXECUTE"
  | "COMPLETE"
  | "LEARN";

export type NormalTransactionNotification =
  | "estimate_ready"
  | "searching_worker"
  | "worker_matched"
  | "worker_arrived"
  | "completed_by_worker"
  | "review_thanks";

export type NormalTransactionPlanInput = {
  readonly serviceType: ServiceType;
  readonly hasMedia: boolean;
  readonly descriptionCharCount: number;
  readonly visionConfidence: number;
  readonly matchLatencyMs: number;
  readonly bookingTiming: "now" | "scheduled";
  readonly incidentReported: boolean;
  readonly declineCount: number;
};

export type NormalTransactionPlan = {
  readonly serviceType: ServiceType;
  readonly phases: readonly { name: NormalTransactionPhaseName; workflow: readonly string[] }[];
  readonly skips: {
    readonly clarification: boolean;
    readonly searchingNotification: boolean;
    readonly onWayNotification: boolean;
    readonly inspectingRepairingNotification: boolean;
    readonly safetyLearning: boolean;
    readonly declineLearning: boolean;
  };
  readonly customerNotifications: readonly NormalTransactionNotification[];
  readonly customerNotificationBudget: {
    readonly max: 5;
    readonly actual: number;
    readonly withinBudget: boolean;
  };
  readonly silentStatuses: readonly string[];
};

export type NormalTransactionLearningInput = {
  readonly reviewed: boolean;
  readonly completedByWorker: boolean;
  readonly incidentReported: boolean;
  readonly declineCount: number;
};

export type NormalTransactionLearningSummary = {
  readonly realtimeMemory: readonly string[];
  readonly backgroundMemory: readonly string[];
  readonly learningEvents: readonly string[];
  readonly skillIds: readonly string[];
};

export type NormalTransactionMetricsInput = {
  readonly intakeLatencyMs: number;
  readonly totalCostUsd: number;
  readonly successCount: number;
  readonly repetitionCount: number;
  readonly finalPrice: number | null;
  readonly kaelPriceMax: number | null;
};

export type NormalTransactionMetrics = {
  readonly latencyOk: boolean;
  readonly costOk: boolean;
  readonly repetitionsOk: boolean;
  readonly finalPriceOk: boolean;
  readonly pass: boolean;
};

export const NORMAL_TRANSACTION_SILENT_STATUSES = [
  "worker_on_way",
  "inspecting",
  "repairing",
] as const;

export function buildNormalTransactionPlan(
  input: NormalTransactionPlanInput,
): NormalTransactionPlan {
  const clarification = shouldSkipClarification(input);
  const searchingNotification = input.matchLatencyMs < 5_000;
  const notifications: NormalTransactionNotification[] = [
    "estimate_ready",
    ...(searchingNotification ? [] : ["searching_worker" as const]),
    "worker_matched",
    "worker_arrived",
    "completed_by_worker",
    "review_thanks",
  ];

  return {
    serviceType: input.serviceType,
    phases: [
      { name: "INTAKE", workflow: ["A2", "A3", clarification ? "A4:skipped" : "A4", "A5"] },
      { name: "CONFIRM", workflow: ["A6", "A7", "worker_brief_core"] },
      { name: "MATCH", workflow: ["A8", "B3", "B4", "worker_brief_guidance"] },
      { name: "EXECUTE", workflow: ["B5:silent_on_way", "B5:arrived_notification", "B5:silent_work"] },
      { name: "COMPLETE", workflow: ["B7", "A12", "A13:payment_placeholder"] },
      { name: "LEARN", workflow: ["A14", "LS1", "LS2", "LS3", "LS4", "LS5"] },
    ],
    skips: {
      clarification,
      searchingNotification,
      onWayNotification: input.bookingTiming === "now",
      inspectingRepairingNotification: true,
      safetyLearning: !input.incidentReported,
      declineLearning: input.declineCount === 0,
    },
    customerNotifications: notifications,
    customerNotificationBudget: {
      max: 5,
      actual: notifications.length,
      withinBudget: notifications.length <= 5,
    },
    silentStatuses: NORMAL_TRANSACTION_SILENT_STATUSES,
  };
}

export function summarizeNormalTransactionLearning(
  input: NormalTransactionLearningInput,
): NormalTransactionLearningSummary {
  const skillIds = new Set<string>();
  const events: string[] = [];
  if (input.completedByWorker) {
    events.push("post-B7");
    skillIds.add("LS3");
  }
  if (input.reviewed) {
    events.push("post-A14");
    for (const id of ["LS1", "LS2", "LS4", "LS5"]) skillIds.add(id);
  }
  if (input.incidentReported) skillIds.add("LS6");
  if (input.declineCount > 0) skillIds.add("LS7");

  return {
    realtimeMemory: [
      "L2_job_memory",
      "L3_customer_satisfaction",
      "L4_worker_rating",
      "L5_ls1_evidence_increment",
    ],
    backgroundMemory: [
      "L3_customer_preference",
      "L4_worker_service_skill_proficiency",
      "L5_ls2_case_review",
      "L5_ls3_worker_pattern",
      "L5_ls4_customer_preference",
      "L5_ls5_service_knowledge",
    ],
    learningEvents: events,
    skillIds: Array.from(skillIds).sort(),
  };
}

export function evaluateNormalTransactionMetrics(
  input: NormalTransactionMetricsInput,
): NormalTransactionMetrics {
  const latencyOk = input.intakeLatencyMs <= 9_000;
  const costOk = input.totalCostUsd >= 0.07 && input.totalCostUsd <= 0.10;
  const repetitionsOk = input.repetitionCount > 0 &&
    input.successCount === input.repetitionCount;
  const finalPriceOk = input.finalPrice !== null &&
    input.kaelPriceMax !== null &&
    input.finalPrice === input.kaelPriceMax;
  return {
    latencyOk,
    costOk,
    repetitionsOk,
    finalPriceOk,
    pass: latencyOk && costOk && repetitionsOk && finalPriceOk,
  };
}

function shouldSkipClarification(input: NormalTransactionPlanInput): boolean {
  return input.hasMedia &&
    input.descriptionCharCount >= 50 &&
    input.visionConfidence >= 0.7;
}
