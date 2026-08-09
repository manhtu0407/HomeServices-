

import {
  listNotifications,
  markNotificationRead,
  notifyCustomerScopeChangeRequested,
  registerDevicePushToken,
  unregisterDevicePushToken,
} from "./domains/notification/notifications.ts";
import { listServices } from "./domains/catalog/catalog.ts";
import { placesAutocomplete, placesResolve } from "./domains/places/geo.ts";
import {
  getMyKaelMemory,
  getWorkerKaelMemory,
  deleteMyKaelMemory,
  updateMyKaelMemory,
  updateWorkerKaelMemoryPreference,
} from "./domains/kael-chat/memory.ts";
import {
  registerWorker,
  getWorkerProfile,
  recordWorkerAppActiveMinute,
  submitWorkerApplication,
  updateWorkerServiceArea,
  updateWorkerServicePreferences,
  updateWorkerAvailability,
  listWorkerBroadcasts,
  getWorkerEarnings,
} from "./domains/worker/workers.ts";
import { listWorkerJobs } from "./domains/worker/jobs.ts";
import { getWorkerRouteMap, getWorkerRoutePreview } from "./domains/worker/route.ts";
import { projectAddressAccess, authorizeApartmentAccess } from "./domains/worker/apartment-access.ts";

import {
  openDispute,
  submitDisputeCounterStatement,
  decideDispute,
} from "./domains/dispute/dispute.ts";

import { decideScopeChange, requestScopeChange } from "./domains/job/scope-change/request.ts";
import { getJobIncident, openJobIncident, proposeScopeChangeFromJobIncident } from "./domains/job/incident.ts";
import { confirmCompletion, submitReview } from "./domains/payment/completion-review.ts";
import { confirmStagingPayment, createStagingPaymentIntent } from "./domains/payment/staging.ts";
import { createSePayVietQrPaymentIntent } from "./domains/payment/sepay-vietqr.ts";
import { confirmWorkerCashPayment } from "./domains/payment/cash.ts";
import { listJobMessages, listMyThreads, sendJobMessage } from "./domains/job/chat.ts";
import { createKaelChat } from "./domains/kael-chat/create.ts";
import {
  createKaelChatMediaUpload,
  revokeKaelChatMedia,
} from "./domains/kael-chat/media-upload.ts";
import {
  getKaelChat,
  getKaelChatProgress,
} from "./domains/kael-chat/read.service.ts";
import { sendKaelChatTurn } from "./domains/kael-chat/turn.ts";
import { submitKaelChatEvidence } from "./domains/kael-chat/evidence.ts";
import { decideKaelIntakeConfirmation } from "./domains/kael-chat/intake-confirmation.service.ts";
import { answerKaelAssistant } from "./domains/customer/assistant.ts";
import {
  archiveCustomerKaelConversation,
  createCustomerKaelConversation,
  getCustomerKaelConversation,
  listCustomerKaelConversations,
  renameCustomerKaelConversation,
  sendCustomerKaelConversationTurn,
  setCustomerKaelConversationPinned,
} from "./domains/customer/kael-conversation.ts";
import { archiveWorkerKaelChat, askKaelForWorker, createWorkerKaelChat, getWorkerKaelChat, listWorkerKaelChats, renameWorkerKaelChat, sendWorkerKaelChatTurn, setWorkerKaelChatPinned } from "./domains/worker/kael-chat.ts";
import {
  streamKaelChatEvidence,
  streamKaelChatTurn,
} from "./domains/kael-chat/stream.ts";
import { streamCustomerKaelConversationTurn } from "./domains/kael-chat/customer-conversation-stream.ts";
import { streamWorkerKaelChatTurn } from "./domains/kael-chat/worker-stream.ts";
import { approveKaelLearningCandidateAdmin, evaluatePriceSynthesisAbCaseAdmin, invalidateMarketCache, listKaelLearningCandidatesAdmin, monitorKaelLearningRulesAdmin, processKaelBatchResultsAdmin, processKaelLearningQueueAdmin, rejectKaelLearningCandidateAdmin } from "./domains/admin/learning.ts";
import { getWorkerKaelTrainingConsent, setWorkerKaelTrainingConsent, submitCustomerKaelFeedback, submitWorkerKaelFeedback } from "./domains/kael-chat/feedback.ts";
import {
  attachJobMedia,
  createJobMediaUpload,
  revokeJobMediaUploads,
} from "./domains/job/media.ts";
import { getJob, listCustomerActiveJobs, listCustomerServiceHistory, listMyPendingDecisions } from "./domains/job/read.ts";
import {
  createCustomerAvatarUpload,
  createWorkerAvatarUpload,
  getCustomerAvatar,
  updateCustomerAvatar,
  updateWorkerAvatar,
} from "./domains/worker/avatar.ts";
import { cancelJob, requestCustomerCancellation } from "./domains/customer/cancellation.ts";
import { requestWorkerCancellation } from "./domains/worker/cancellation.ts";
import {
  acceptBroadcast,
  confirmSearch,
  declineBroadcast,
} from "./domains/matching/flow.ts";
import { confirmWorkerCandidate, getWorkerCandidate, rejectWorkerCandidate } from "./domains/matching/candidate.ts";
import { removeCustomerFavoriteWorker, saveCustomerFavoriteWorker } from "./domains/customer/favorite-worker.ts";
import { createJob } from "./domains/job/create/create.ts";
import { updateJobStatus } from "./domains/job/status.ts";
import { confirmKaelChat } from "./domains/kael-chat/confirm.service.ts";
import { getCustomerProfileInsights } from "./domains/customer/profile-insights.ts";
import { getWorkerPerformanceInsights } from "./domains/worker/profile-insights.ts";
import {
  getCustomerRefundAccount,
  saveCustomerRefundAccount,
} from "./domains/customer/refund-account.ts";
import { deleteCustomerAccount } from "./domains/customer/account-deletion.ts";

import type { MobileApiContext } from "./platform/auth.ts";
import type { MobileApiServices } from "./http/contracts.ts";

import { type EdgeAiSecrets, type EdgeGuardClient, getPublicKaelCharter } from "./kael/index.ts";
import type { SePayVietQrConfig } from "../../_shared/platform/env.ts";

export type EdgeServiceSecrets = EdgeAiSecrets & {
  sepayVietQr?: SePayVietQrConfig;
};

export function createEdgeServices(secrets: EdgeServiceSecrets): MobileApiServices {
  return {
    ...createDiscoveryServices(secrets),
    ...createKaelChatServices(secrets),
    ...createJobWorkflowServices(secrets),
    ...createWorkerWorkflowServices(secrets),
    ...createProfileServices(secrets),
    ...createAdminNotificationServices(secrets),
  };
}

function createDiscoveryServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "listServices"
  | "placesAutocomplete"
  | "placesResolve"
  | "createJob"
  | "getJob"
  | "listCustomerActiveJobs"
  | "listCustomerServiceHistory"
> {
  return {
    listServices,
    placesAutocomplete: (ctx, input) => placesAutocomplete(ctx, input, secrets),
    placesResolve: (ctx, input) => placesResolve(ctx, input, secrets),
    createJob: (ctx, input) => createJob(ctx, input, aiRuntime(ctx, secrets)),
    getJob: (ctx, jobId) => getJob(ctx, jobId, {
      paymentRailAvailable: ctx.role === "customer" && secrets.sepayVietQr?.enabled === true,
    }),
    listCustomerActiveJobs: (ctx) => listCustomerActiveJobs(ctx, {
      paymentRailAvailable: secrets.sepayVietQr?.enabled === true,
    }),
    listCustomerServiceHistory,
  };
}

function createKaelChatServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "createKaelChat"
  | "answerKaelAssistant"
  | "createCustomerKaelConversation"
  | "listCustomerKaelConversations"
  | "archiveCustomerKaelConversation"
  | "renameCustomerKaelConversation"
  | "setCustomerKaelConversationPinned"
  | "getCustomerKaelConversation"
  | "sendCustomerKaelConversationTurn"
  | "streamCustomerKaelConversationTurn"
  | "createKaelChatMediaUpload"
  | "revokeKaelChatMedia"
  | "getKaelChat"
  | "getKaelChatProgress"
  | "streamKaelChatTurn"
  | "streamKaelChatEvidence"
  | "sendKaelChatTurn"
  | "decideKaelIntakeConfirmation"
  | "confirmKaelChat"
  | "submitKaelChatEvidence"
> {
  return {
    createKaelChat: (ctx, input) => createKaelChat(ctx, input, aiRuntime(ctx, secrets)),
    answerKaelAssistant: (ctx, input) => answerKaelAssistant(ctx, input, {
      ...aiRuntime(ctx, secrets),
      paymentRailAvailable: ctx.role === "customer" && secrets.sepayVietQr?.enabled === true,
    }),
    createCustomerKaelConversation,
    listCustomerKaelConversations,
    archiveCustomerKaelConversation,
    renameCustomerKaelConversation,
    setCustomerKaelConversationPinned,
    getCustomerKaelConversation,
    sendCustomerKaelConversationTurn: (ctx, conversationId, input) =>
      sendCustomerKaelConversationTurn(ctx, conversationId, input, aiRuntime(ctx, secrets)),
    streamCustomerKaelConversationTurn: (ctx, conversationId, input) =>
      streamCustomerKaelConversationTurn(ctx, conversationId, input, aiRuntime(ctx, secrets)),
    createKaelChatMediaUpload,
    revokeKaelChatMedia,
    getKaelChat,
    getKaelChatProgress,
    streamKaelChatTurn: (ctx, sessionId, input) =>
      streamKaelChatTurn(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    streamKaelChatEvidence: (ctx, sessionId, input) =>
      streamKaelChatEvidence(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    sendKaelChatTurn: (ctx, sessionId, input) =>
      sendKaelChatTurn(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    decideKaelIntakeConfirmation: (ctx, sessionId, input) =>
      decideKaelIntakeConfirmation(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    confirmKaelChat: (ctx, sessionId) => confirmKaelChat(ctx, sessionId, aiRuntime(ctx, secrets)),
    submitKaelChatEvidence: (ctx, sessionId, input) =>
      submitKaelChatEvidence(ctx, sessionId, input, aiRuntime(ctx, secrets)),
  };
}

function createJobWorkflowServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "confirmSearch"
  | "cancelJob"
  | "acceptBroadcast"
  | "declineBroadcast"
  | "getWorkerCandidate"
  | "confirmWorkerCandidate"
  | "rejectWorkerCandidate"
  | "saveCustomerFavoriteWorker"
  | "removeCustomerFavoriteWorker"
  | "updateJobStatus"
  | "authorizeApartmentAccess"
  | "requestScopeChange"
  | "getJobIncident"
  | "openJobIncident"
  | "proposeScopeChangeFromJobIncident"
> {
  return {
    confirmSearch,
    cancelJob,
    acceptBroadcast,
    declineBroadcast,
    getWorkerCandidate,
    confirmWorkerCandidate,
    rejectWorkerCandidate,
    saveCustomerFavoriteWorker,
    removeCustomerFavoriteWorker,
    updateJobStatus,
    authorizeApartmentAccess,
    requestScopeChange: (ctx, jobId, input) =>
      requestScopeChange(ctx, jobId, input, aiRuntime(ctx, secrets)),
    getJobIncident,
    openJobIncident: (ctx, jobId, input) =>
      openJobIncident(ctx, jobId, input, aiRuntime(ctx, secrets)),
    proposeScopeChangeFromJobIncident: (ctx, jobId, input) =>
      proposeScopeChangeFromJobIncident(ctx, jobId, input, aiRuntime(ctx, secrets)),
  };
}

function createWorkerWorkflowServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "askKaelForWorker"
  | "createWorkerKaelChat"
  | "listWorkerKaelChats"
  | "archiveWorkerKaelChat"
  | "setWorkerKaelChatPinned"
  | "renameWorkerKaelChat"
  | "getWorkerKaelChat"
  | "sendWorkerKaelChatTurn"
  | "streamWorkerKaelChatTurn"
  | "submitWorkerKaelFeedback"
  | "getWorkerKaelTrainingConsent"
  | "setWorkerKaelTrainingConsent"
  | "requestCustomerCancellation"
  | "requestWorkerCancellation"
  | "openDispute"
  | "submitDisputeCounterStatement"
  | "decideDispute"
  | "attachJobMedia"
  | "createJobMediaUpload"
  | "revokeJobMediaUploads"
  | "listJobMessages"
  | "sendJobMessage"
  | "decideScopeChange"
  | "confirmCompletion"
  | "createPaymentIntent"
  | "confirmWorkerCashPayment"
  | "confirmStagingPayment"
  | "submitReview"
  | "submitCustomerKaelFeedback"
> {
  return {
    askKaelForWorker,
    createWorkerKaelChat: (ctx, input) => createWorkerKaelChat(ctx, input, aiRuntime(ctx, secrets)),
    listWorkerKaelChats,
    archiveWorkerKaelChat,
    setWorkerKaelChatPinned,
    renameWorkerKaelChat,
    getWorkerKaelChat,
    sendWorkerKaelChatTurn: (ctx, sessionId, input) =>
      sendWorkerKaelChatTurn(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    streamWorkerKaelChatTurn: (ctx, sessionId, input) =>
      streamWorkerKaelChatTurn(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    submitWorkerKaelFeedback,
    getWorkerKaelTrainingConsent,
    setWorkerKaelTrainingConsent,
    requestCustomerCancellation,
    requestWorkerCancellation,
    openDispute,
    submitDisputeCounterStatement,
    decideDispute,
    attachJobMedia,
    createJobMediaUpload,
    revokeJobMediaUploads,
    listJobMessages,
    sendJobMessage: (ctx, jobId, input) => sendJobMessage(ctx, jobId, input, aiRuntime(ctx, secrets)),
    decideScopeChange,
    confirmCompletion,
    createPaymentIntent: (ctx, jobId) => secrets.sepayVietQr?.enabled
      ? createSePayVietQrPaymentIntent(ctx, jobId, secrets.sepayVietQr)
      : createStagingPaymentIntent(ctx, jobId, secrets.stagingPaymentRailEnabled === true),
    confirmWorkerCashPayment,
    confirmStagingPayment: (ctx, jobId) =>
      confirmStagingPayment(ctx, jobId, secrets.stagingPaymentRailEnabled === true),
    submitReview,
    submitCustomerKaelFeedback,
  };
}

function createProfileServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "getKaelCharter"
  | "registerWorker"
  | "submitWorkerApplication"
  | "getCustomerProfileInsights"
  | "getCustomerAvatar"
  | "createCustomerAvatarUpload"
  | "updateCustomerAvatar"
  | "getCustomerRefundAccount"
  | "saveCustomerRefundAccount"
  | "deleteCustomerAccount"
  | "getMyKaelMemory"
  | "getWorkerKaelMemory"
  | "deleteMyKaelMemory"
  | "updateMyKaelMemory"
  | "updateWorkerKaelMemoryPreference"
  | "listMyPendingDecisions"
  | "listMyThreads"
  | "getWorkerProfile"
  | "createWorkerAvatarUpload"
  | "updateWorkerAvatar"
  | "recordWorkerAppActiveMinute"
  | "getWorkerPerformanceInsights"
  | "updateWorkerServiceArea"
  | "updateWorkerServicePreferences"
  | "updateWorkerAvailability"
  | "listWorkerBroadcasts"
  | "listWorkerJobs"
  | "getWorkerRoutePreview"
  | "getWorkerRouteMap"
  | "getWorkerEarnings"
> {
  return {
    getKaelCharter,
    registerWorker,
    submitWorkerApplication,
    getCustomerProfileInsights,
    getCustomerAvatar,
    createCustomerAvatarUpload,
    updateCustomerAvatar,
    getCustomerRefundAccount,
    saveCustomerRefundAccount,
    deleteCustomerAccount,
    getMyKaelMemory,
    getWorkerKaelMemory,
    deleteMyKaelMemory,
    updateMyKaelMemory,
    updateWorkerKaelMemoryPreference,
    listMyPendingDecisions,
    listMyThreads,
    getWorkerProfile,
    createWorkerAvatarUpload,
    updateWorkerAvatar,
    recordWorkerAppActiveMinute,
    getWorkerPerformanceInsights,
    updateWorkerServiceArea,
    updateWorkerServicePreferences,
    updateWorkerAvailability,
    listWorkerBroadcasts,
    listWorkerJobs,
    getWorkerRoutePreview: (ctx, jobId, origin) => getWorkerRoutePreview(ctx, jobId, origin, secrets),
    getWorkerRouteMap: (ctx, jobId, origin) => getWorkerRouteMap(ctx, jobId, origin, secrets),
    getWorkerEarnings,
  };
}

function createAdminNotificationServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "invalidateMarketCache"
  | "evaluatePriceSynthesisAbCase"
  | "processKaelLearningQueue"
  | "processKaelBatchResults"
  | "monitorKaelLearningRules"
  | "listKaelLearningCandidates"
  | "approveKaelLearningCandidate"
  | "rejectKaelLearningCandidate"
  | "listNotifications"
  | "markNotificationRead"
  | "registerDevicePushToken"
  | "unregisterDevicePushToken"
> {
  return {
    invalidateMarketCache,
    evaluatePriceSynthesisAbCase: (ctx, input) =>
      evaluatePriceSynthesisAbCaseAdmin(ctx, input, aiRuntime(ctx, secrets)),
    processKaelLearningQueue: (ctx, input) =>
      processKaelLearningQueueAdmin(ctx, input, aiRuntime(ctx, secrets)),
    processKaelBatchResults: (ctx, input) =>
      processKaelBatchResultsAdmin(ctx, input, aiRuntime(ctx, secrets)),
    monitorKaelLearningRules: (ctx, input) => monitorKaelLearningRulesAdmin(ctx, input),
    listKaelLearningCandidates: (ctx, input) => listKaelLearningCandidatesAdmin(ctx, input),
    approveKaelLearningCandidate: (ctx, candidateId, input) =>
      approveKaelLearningCandidateAdmin(ctx, candidateId, input),
    rejectKaelLearningCandidate: (ctx, candidateId, input) =>
      rejectKaelLearningCandidateAdmin(ctx, candidateId, input),
    listNotifications,
    markNotificationRead,
    registerDevicePushToken,
    unregisterDevicePushToken,
  };
}

function getKaelCharter() {
  return getPublicKaelCharter();
}

function aiRuntime(
  ctx: MobileApiContext,
  secrets: EdgeAiSecrets,
): EdgeAiSecrets {
  return {
    ...secrets,
    ...(ctx.traceContext ? { harnessTrace: ctx.traceContext } : {}),
    ...(secrets.durableGuardsEnabled
      ? { durableGuardClient: ctx.supabase as EdgeGuardClient }
      : {}),
  };
}

export { buildCustomerProfileInsights } from "./domains/customer/profile-insights.ts";
export { buildWorkerPerformanceInsights } from "./domains/worker/profile-insights.ts";

// Idempotent Kael chat session helpers.

// Idempotent job creation helpers.

// Shared boundary entry point used by both
// createKaelChat and sendKaelChatTurn. Returns true when the message was
// declined (caller skips downstream processing); false otherwise.

// Smart clarification build a compact, PII-scrubbed conversation
// context from recent turns and count prior Kael clarification questions so the
// pipeline can cap re-asks (STRUCTURES.md A4 "ask 0-2 questions").

// Customer mobile must resume an
// active job from the backend after a refresh / cold start instead of showing
// "Chưa có yêu cầu". Returns the customer's most-recent non-terminal job (same
// shape as GET /jobs/:id) or null when none is active.

// Compact the schema-validated vision result into a short
// findings line for the worker-assist context. Bounded length; no PII (these
// are Kael's own image observations about the physical problem).

// A scope-change changes the price of the
// deal, so it is ALWAYS confirmed by the customer — even low-risk. Kael only
// computes and proposes the new price; it never self-approves a scope change.
//
// This disable is intentionally UNCONDITIONAL and independent of
// KAEL_AUTONOMY_FULL_ENABLED (which still gates completion/payment/dispute/
// cancellation). Re-enabling auto-approve is a product decision, not a flag
// flip. The customer-decide path is unchanged: request_scope_change keeps the
// job in scope_change_pending, the caller routes null here to
// notifyCustomerScopeChangeRequested, and the customer's explicit decision goes
// through decide_scope_change_atomic. Signature kept stable so the single caller
// needs no change and re-enabling is a localized edit.

// Persist Kael's computed scope-change estimate +
// log the API call. Stored in scope_change_requests.kael_review (full payload)
// and scope_change_requests.kael_computed_min/max + price_min/max (numeric
// authoritative source). Customer A11 modal reads kael_computed_*.

// Self-check the demanding-customer response text
// before it reaches a user, so "self-check before every egress" holds for case-2 too
// (not only worker-assist). Template responses pass through unchanged; if the text ever
// becomes LLM-phrased and trips the guard, fall back to a neutral acknowledgement.

// Edit the user-owned subset of their own Kael memory.
// Customer can set language + a PII-scrubbed preference note; worker can set
// language only (worker_kael_memory has no preference_summary). Kael-computed
// fields stay untouched. Upsert so a not-yet-created memory row is fine.

// The customer's pending Kael decisions. Under Kael Autonomy v2 the only thing
// that genuinely waits on the customer is a scope-change (it changes the deal
// price, so it is always customer-confirmed). Scoped to this customer's own jobs.

// Cross-job message inbox for the customer. No realtime/RPC —
// list recent jobs, fold in the latest message + unread count per thread. A job
// with no messages yet is not surfaced as a thread.

// A worker lobby check-in records arrival but does NOT release the
// exact unit — it waits for the customer to tap "Cho thợ lên" (authorizeApartmentAccess).
// Nudge the customer the moment the worker checks in so they authorize promptly instead
// of leaving the worker waiting in the lobby. Best-effort: never blocks the status update.

// §32.6: matching consumes the disintermediation risk signal as a SOFT ranking
// penalty — never an exclusion ("không nuke worker khan hiếm vì tín hiệu yếu").
// Threshold 2 = a single weak signal has no effect; the 15-point penalty ranks a
// flagged worker below an equal-rating clean worker (~1.5 rating stars) without
// removing them from the pool.

// Keep Kael-owned scope-change price failures user-visible instead of DB_ERROR.

// A geofence check-in must be within this radius of
// the job's geocoded building before the exact unit is released. ~150 m absorbs HCMC
// apartment-tower GPS drift while still blocking a release from across town. Tune here
// if field recordings show a different real-world drift.

// The customer authorizes "Cho thợ lên" — this is the
// only path that releases the exact unit, and only after the worker has checked in.
// Route POST /jobs/:id/access/authorize is gated to the customer (+ admin) role.

// A worker check-in records arrival but does NOT
// release the exact unit. exact_unit_released stays false (projectAddressAccess keeps the
// worker at building_released) until the CUSTOMER authorizes via
// POST /jobs/:id/access/authorize. This closes the "worker self-reports arrival and the
// app reveals the unit with no customer consent" gap.

// The customer authorizing entry releases the exact
// unit — only reachable after a worker check-in (enforced in authorizeApartmentAccess).
