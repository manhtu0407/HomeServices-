import { detectForbiddenAiDecisionText } from "../ai-boundary-contract.ts";

export type DisputeType =
  | "completion_rejected"
  | "damage_claim"
  | "unpaid_service"
  | "abusive_behavior_customer"
  | "abusive_behavior_worker"
  | "scope_disagreement_post_job"
  | "other";

export type DisputeSubCase =
  | "completion_rejected"
  | "damage_claim"
  | "unpaid_service"
  | "abusive_behavior"
  | "scope_disagreement_post_job"
  | "other";

export type DisputeSubCaseDecision = {
  readonly subCase: DisputeSubCase;
  readonly deferred: boolean;
  readonly priority: "low" | "medium" | "high" | "critical";
  readonly adminReviewRequired: boolean;
};

export type DisputeEvidenceSnapshotInput = {
  readonly lockedAt: string;
  readonly chatMessageIds: readonly string[];
  readonly photoUrls: readonly string[];
  readonly statusTimeline: readonly { status: string; at: string }[];
  readonly scopeChangeIds: readonly string[];
  readonly kaelArtifactIds: readonly string[];
};

export type DisputeAbuseInput = {
  readonly customerDisputes30d: number;
  readonly customerCompletedJobs30d: number;
  readonly workerDisputes30d: number;
  readonly workerCompletedJobs30d: number;
  readonly frivolousDisputes30d: number;
  readonly samePartyRepeatDisputes30d: number;
};

export type DisputeAbuseSignal =
  | "customer_dispute_rate_threshold"
  | "worker_dispute_rate_threshold"
  | "frivolous_dispute_threshold"
  | "same_party_repeat_threshold";

export type DisputeAbuseEvaluation = {
  readonly customerDisputeRate: number;
  readonly workerDisputeRate: number;
  readonly signals: readonly DisputeAbuseSignal[];
  readonly adminReviewRequired: boolean;
  readonly queuePriority: "none" | "medium" | "high";
};

export function determineDisputeSubCase(input: {
  readonly disputeType: DisputeType;
  readonly jobStatus: string;
  readonly hoursAfterCompletion?: number;
}): DisputeSubCaseDecision {
  if (input.disputeType === "unpaid_service") {
    return {
      subCase: "unpaid_service",
      deferred: true,
      priority: "medium",
      adminReviewRequired: true,
    };
  }
  if (input.disputeType === "damage_claim") {
    return {
      subCase: "damage_claim",
      deferred: false,
      priority: input.hoursAfterCompletion !== undefined && input.hoursAfterCompletion <= 48
        ? "high"
        : "medium",
      adminReviewRequired: true,
    };
  }
  if (input.disputeType === "completion_rejected") {
    return {
      subCase: "completion_rejected",
      deferred: false,
      priority: "high",
      adminReviewRequired: true,
    };
  }
  if (
    input.disputeType === "abusive_behavior_customer" ||
    input.disputeType === "abusive_behavior_worker"
  ) {
    return {
      subCase: "abusive_behavior",
      deferred: false,
      priority: "high",
      adminReviewRequired: true,
    };
  }
  if (input.disputeType === "scope_disagreement_post_job") {
    return {
      subCase: "scope_disagreement_post_job",
      deferred: false,
      priority: "high",
      adminReviewRequired: true,
    };
  }
  return {
    subCase: "other",
    deferred: false,
    priority: "medium",
    adminReviewRequired: true,
  };
}

export function buildNeutralDisputeSummary(input: {
  readonly disputeType: DisputeType;
  readonly initiatedBy: "customer" | "worker" | "admin";
  readonly initiatorStatement: string;
  readonly counterPartyStatement?: string | null;
  readonly evidenceCounts: {
    readonly chatMessages: number;
    readonly photoUrls: number;
    readonly statusEvents: number;
    readonly scopeChanges: number;
    readonly kaelArtifacts: number;
  };
}) {
  const counterLabel = input.initiatedBy === "worker" ? "Customer" : "Worker";
  const lines = [
    `Dispute type: ${input.disputeType}.`,
    `${capitalize(input.initiatedBy)} statement: ${sanitizeSummaryText(input.initiatorStatement)}`,
    `${counterLabel} statement: ${sanitizeSummaryText(input.counterPartyStatement ?? "Not submitted yet.")}`,
    `Evidence snapshot: ${input.evidenceCounts.chatMessages} chat messages, ${input.evidenceCounts.photoUrls} photos, ${input.evidenceCounts.statusEvents} status events, ${input.evidenceCounts.scopeChanges} scope changes, ${input.evidenceCounts.kaelArtifacts} Kael artifacts.`,
    "Kael summary is fact-only for admin review and does not decide outcome.",
  ];
  return lines.join(" ").slice(0, 1000);
}

export function assertNeutralDisputeLanguage(summary: string): {
  readonly ok: boolean;
  readonly violations: readonly string[];
} {
  const normalized = summary.toLowerCase();
  const violations = [
    "lying",
    "fraud",
    "scam",
    "fault",
    "must pay",
    "should pay",
    "penalty",
    "refund",
    "compensation",
  ].filter((term) => normalized.includes(term));
  for (const violation of detectForbiddenAiDecisionText(summary).violations) {
    violations.push(violation.reason);
  }
  return { ok: violations.length === 0, violations };
}

export function buildDisputeEvidenceSnapshot(input: DisputeEvidenceSnapshotInput) {
  return {
    evidence_locked_at: input.lockedAt,
    evidence_snapshot: {
      chat_message_ids: [...input.chatMessageIds],
      photo_urls: [...input.photoUrls],
      status_timeline: input.statusTimeline.map((item) => ({ ...item })),
      scope_changes: [...input.scopeChangeIds],
      kael_artifacts: [...input.kaelArtifactIds],
    },
  };
}

export function evaluateDisputeAbuse(input: DisputeAbuseInput): DisputeAbuseEvaluation {
  const customerDisputeRate = input.customerDisputes30d /
    Math.max(1, input.customerCompletedJobs30d);
  const workerDisputeRate = input.workerDisputes30d /
    Math.max(1, input.workerCompletedJobs30d);
  const signals: DisputeAbuseSignal[] = [];

  if (customerDisputeRate > 0.20) signals.push("customer_dispute_rate_threshold");
  if (workerDisputeRate > 0.15) signals.push("worker_dispute_rate_threshold");
  if (input.frivolousDisputes30d >= 3) signals.push("frivolous_dispute_threshold");
  if (input.samePartyRepeatDisputes30d >= 2) signals.push("same_party_repeat_threshold");

  const adminReviewRequired = signals.length > 0;
  return {
    customerDisputeRate,
    workerDisputeRate,
    signals,
    adminReviewRequired,
    queuePriority: signals.some((signal) =>
        signal === "frivolous_dispute_threshold" ||
        signal === "same_party_repeat_threshold"
      )
      ? "high"
      : adminReviewRequired
      ? "medium"
      : "none",
  };
}

function sanitizeSummaryText(input: string) {
  return input
    .replace(/\b(?:0|\+?84)?\d{8,10}\b/g, "[redacted-number]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 260);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
