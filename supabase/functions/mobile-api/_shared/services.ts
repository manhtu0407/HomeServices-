

import {
  listNotifications,
  markNotificationRead,
  notifyCustomerScopeChangeRequested,
  registerDevicePushToken,
  unregisterDevicePushToken,
} from "./services/notifications.service.ts";
import { listServices } from "./services/catalog.service.ts";
import { placesAutocomplete, placesResolve } from "./services/places-geo.service.ts";
import {
  getMyKaelMemory,
  getWorkerKaelMemory,
  deleteMyKaelMemory,
  updateMyKaelMemory,
} from "./services/kael-memory.service.ts";
import {
  registerWorker,
  getWorkerProfile,
  recordWorkerAppActiveMinute,
  submitWorkerApplication,
  updateWorkerServiceArea,
  updateWorkerAvailability,
  listWorkerBroadcasts,
  getWorkerEarnings,
  listWorkerJobs,
} from "./services/workers.service.ts";
import { getWorkerRouteMap, getWorkerRoutePreview } from "./services/worker-route.service.ts";
import { projectAddressAccess, authorizeApartmentAccess } from "./services/apartment-access.service.ts";

import {
  openDispute,
  submitDisputeCounterStatement,
  decideDispute,
} from "./services/dispute.service.ts";

import { decideScopeChange, requestScopeChange } from "./services/scope-change.service.ts";
import { getJobIncident, openJobIncident, proposeScopeChangeFromJobIncident } from "./services/job-incident.service.ts";
import { confirmCompletion, submitReview } from "./services/completion-review.service.ts";
import { listJobMessages, listMyThreads, sendJobMessage } from "./services/chat.service.ts";
import { createKaelChat, createKaelChatMediaUpload, getKaelChat, getKaelChatProgress, revokeKaelChatMedia, sendKaelChatTurn, submitKaelChatEvidence } from "./services/kael-chat.service.ts";
import { answerKaelAssistant } from "./services/customer-assistant.service.ts";
import {
  archiveCustomerKaelConversation,
  createCustomerKaelConversation,
  getCustomerKaelConversation,
  listCustomerKaelConversations,
  renameCustomerKaelConversation,
  sendCustomerKaelConversationTurn,
  setCustomerKaelConversationPinned,
} from "./services/customer-kael-conversation.service.ts";
import { archiveWorkerKaelChat, askKaelForWorker, createWorkerKaelChat, getWorkerKaelChat, listWorkerKaelChats, renameWorkerKaelChat, sendWorkerKaelChatTurn, setWorkerKaelChatPinned } from "./services/worker-kael-chat.service.ts";
import { streamKaelChatTurn, streamWorkerKaelChatTurn } from "./services/kael-chat-stream.ts";
import { approveKaelLearningCandidateAdmin, evaluatePriceSynthesisAbCaseAdmin, invalidateMarketCache, listKaelLearningCandidatesAdmin, monitorKaelLearningRulesAdmin, processKaelBatchResultsAdmin, processKaelLearningQueueAdmin, rejectKaelLearningCandidateAdmin } from "./services/admin-learning.service.ts";
import { getWorkerKaelTrainingConsent, setWorkerKaelTrainingConsent, submitCustomerKaelFeedback, submitWorkerKaelFeedback } from "./services/kael-feedback.service.ts";
import {
  attachJobMedia,
  createJobMediaUpload,
  revokeJobMediaUploads,
} from "./services/job-media.service.ts";
import { getJob, listCustomerActiveJobs, listCustomerServiceHistory, listMyPendingDecisions } from "./services/job-read.service.ts";
import { createWorkerAvatarUpload, updateWorkerAvatar } from "./services/worker-avatar.service.ts";
import { cancelJob, requestCustomerCancellation } from "./services/customer-cancellation.service.ts";
import { decideWorkerCancellation, requestWorkerCancellation } from "./services/worker-cancellation.service.ts";
import {
  acceptBroadcast,
  confirmSearch,
  declineBroadcast,
} from "./services/matching.service.ts";
import { confirmWorkerCandidate, getWorkerCandidate, rejectWorkerCandidate } from "./services/worker-candidate.service.ts";
import { removeCustomerFavoriteWorker, saveCustomerFavoriteWorker } from "./services/customer-favorite-worker.service.ts";
import { createJob } from "./services/job-create.service.ts";
import { updateJobStatus } from "./services/job-status.service.ts";
import { confirmKaelChat } from "./services/kael-chat-confirm.service.ts";
import {
  getCustomerProfileInsights,
  getWorkerPerformanceInsights,
} from "./services/profile-insights.service.ts";

import { type MobileApiContext, type MobileApiServices } from "./router.ts";

import { type EdgeAiSecrets, type EdgeGuardClient, getPublicKaelCharter } from "./kael/index.ts";

export function createEdgeServices(secrets: EdgeAiSecrets): MobileApiServices {
  return {
    listServices,
    placesAutocomplete: (ctx, input) => placesAutocomplete(ctx, input, secrets),
    placesResolve: (ctx, input) => placesResolve(ctx, input, secrets),
    createJob: (ctx, input) => createJob(ctx, input, aiRuntime(ctx, secrets)),
    getJob,
    listCustomerActiveJobs,
    listCustomerServiceHistory,
    createKaelChat: (ctx, input) =>
      createKaelChat(ctx, input, aiRuntime(ctx, secrets)),
    answerKaelAssistant: (ctx, input) =>
      answerKaelAssistant(ctx, input, aiRuntime(ctx, secrets)),
    createCustomerKaelConversation,
    listCustomerKaelConversations,
    archiveCustomerKaelConversation,
    renameCustomerKaelConversation,
    setCustomerKaelConversationPinned,
    getCustomerKaelConversation,
    sendCustomerKaelConversationTurn: (ctx, conversationId, input) =>
      sendCustomerKaelConversationTurn(ctx, conversationId, input, aiRuntime(ctx, secrets)),
    createKaelChatMediaUpload,
    revokeKaelChatMedia,
    getKaelChat,
    getKaelChatProgress,
    streamKaelChatTurn: (ctx, sessionId, input) =>
      streamKaelChatTurn(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    sendKaelChatTurn: (ctx, sessionId, input) =>
      sendKaelChatTurn(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    confirmKaelChat: (ctx, sessionId) =>
      confirmKaelChat(ctx, sessionId, aiRuntime(ctx, secrets)),
    submitKaelChatEvidence: (ctx, sessionId, input) =>
      submitKaelChatEvidence(ctx, sessionId, input, aiRuntime(ctx, secrets)),
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
    askKaelForWorker,
    createWorkerKaelChat: (ctx, input) =>
      createWorkerKaelChat(ctx, input, aiRuntime(ctx, secrets)),
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
    sendJobMessage: (ctx, jobId, input) =>
      sendJobMessage(ctx, jobId, input, aiRuntime(ctx, secrets)),
    decideWorkerCancellation,
    decideScopeChange,
    confirmCompletion,
    submitReview,
    submitCustomerKaelFeedback,
    getKaelCharter,
    registerWorker,
    submitWorkerApplication,
    getCustomerProfileInsights,
    getMyKaelMemory,
    getWorkerKaelMemory,
    deleteMyKaelMemory,
    updateMyKaelMemory,
    listMyPendingDecisions,
    listMyThreads,
    getWorkerProfile,
    createWorkerAvatarUpload,
    updateWorkerAvatar,
    recordWorkerAppActiveMinute,
    getWorkerPerformanceInsights,
    updateWorkerServiceArea,
    updateWorkerAvailability,
    listWorkerBroadcasts,
    listWorkerJobs,
    getWorkerRoutePreview: (ctx, jobId, origin) =>
      getWorkerRoutePreview(ctx, jobId, origin, secrets),
    getWorkerRouteMap: (ctx, jobId, origin) =>
      getWorkerRouteMap(ctx, jobId, origin, secrets),
    getWorkerEarnings,
    invalidateMarketCache,
    evaluatePriceSynthesisAbCase: (ctx, input) =>
      evaluatePriceSynthesisAbCaseAdmin(ctx, input, aiRuntime(ctx, secrets)),
    processKaelLearningQueue: (ctx, input) =>
      processKaelLearningQueueAdmin(ctx, input, aiRuntime(ctx, secrets)),
    processKaelBatchResults: (ctx, input) =>
      processKaelBatchResultsAdmin(ctx, input, aiRuntime(ctx, secrets)),
    monitorKaelLearningRules: (ctx, input) =>
      monitorKaelLearningRulesAdmin(ctx, input),
    listKaelLearningCandidates: (ctx, input) =>
      listKaelLearningCandidatesAdmin(ctx, input),
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
  if (!secrets.durableGuardsEnabled) return secrets;
  return {
    ...secrets,
    durableGuardClient: ctx.supabase as EdgeGuardClient,
  };
}

export { buildCustomerProfileInsights, buildWorkerPerformanceInsights } from "./services/profile-insights.service.ts";

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
