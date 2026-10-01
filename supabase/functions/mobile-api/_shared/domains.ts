

import {
  acknowledgeMatchingPushDelivery,
  listNotifications,
  markNotificationRead,
  notifyCustomerScopeChangeRequested,
  registerDevicePushToken,
  unregisterDevicePushToken,
} from "./domains/notification/notifications.ts";
import { listServices } from "./domains/catalog/catalog.ts";
import { getServiceCoverageReadiness } from "./domains/catalog/coverage.ts";
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
  saveWorkerRegistrationDraft,
  getWorkerProfile,
  getWorkerReadiness,
  recordWorkerAppActiveMinute,
  submitWorkerApplication,
  updateWorkerServiceArea,
  updateWorkerServicePreferences,
  updateWorkerAvailability,
  listWorkerBroadcasts,
  markWorkerBroadcastSeen,
  recordWorkerMatchingHeartbeat,
  submitWorkerMatchingProposal,
  getWorkerEarnings,
} from "./domains/worker/workers.ts";
import { listWorkerJobs } from "./domains/worker/jobs.ts";
import { submitWorkerRegistrationCommand, getWorkerRegistrationCommand } from "./domains/worker/registration-command.ts";
import { getWorkerRouteMap, getWorkerRoutePreview } from "./domains/worker/route.ts";
import { projectAddressAccess, authorizeApartmentAccess } from "./domains/worker/apartment-access.ts";

import {
  openDispute,
  submitDisputeCounterStatement,
  decideDispute,
} from "./domains/dispute/dispute.ts";

import { decideScopeChange, requestScopeChange } from "./domains/job/scope-change/request.ts";
import { getJobIncident, openJobIncident, previewScopeChangeFromJobIncident, proposeScopeChangeFromJobIncident } from "./domains/job/incident.ts";
import { submitReview } from "./domains/payment/completion-review.ts";
import {
  claimManualBankPayment,
  confirmCompletionAndCreateManualBankOrder,
  createManualBankPaymentOrder,
} from "./domains/payment/manual-bank.ts";
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
import {
  decideAdminWorkerApplication,
  cancelAdminManagerNomination,
  getAdminActor,
  getAdminOperations,
  getAdminWorkerApplication,
  listAdminSubAdmins,
  listAdminWorkerApplications,
  nominateAdminManager,
  searchAdminSubAdminAccounts,
  setAdminSubAdminAccess,
  setAdminWorkerAccess,
} from "./domains/admin/control.ts";
import { getAdminOverviewDetails } from "./domains/admin/overview-details.ts";
import {
  createAdminScopeEvidenceAccess,
  createAdminSupportEvidenceAccess,
  getAdminScopeChange,
  getAdminSupportCase,
  listAdminScopeChanges,
  listAdminSupportCases,
  updateAdminSupportCasePreparation,
} from "./domains/admin/operations-support.ts";
import {
  applyAdminWorkflowRecoveryAction,
  getAdminWorkflowRecoveryCase,
  listAdminWorkflowRecoveryCases,
} from "./domains/admin/workflow-recovery.ts";
import {
  decideAdminWorkerProfile,
  getAdminWorkerReviewDetail,
} from "./domains/admin/worker-review.ts";
import {
  provisionAdminOperator,
  resetPendingAdminOperatorPassword,
} from "./domains/admin/operator-provisioning.ts";
import { activateAdminOperator, getAdminActivation } from "./domains/admin/admin-activation.ts";
import {
  listAdminAiCosts,
  listAdminDisputes,
  listAdminLearningRules,
  listAdminPriceBaselines,
  listAdminServiceTaxonomy,
} from "./domains/admin/governance.ts";
import {
  applyAdminSystemLearningAction,
  getAdminSystemLearningRule,
  getAdminSystemModelHealthDetail,
  getAdminSystemPriceBaseline,
  getAdminSystemTaxonomy,
  listAdminSystemEvidencePackages,
  listAdminSystemLearningRules,
  listAdminSystemModelHealth,
  listAdminSystemPriceBaselines,
  listAdminSystemTaxonomy,
  previewAdminSystemLearningAction,
  publishAdminSystemPriceBaseline,
  retireAdminSystemPriceBaseline,
  updateAdminSystemTaxonomy,
  validateAdminSystemPriceBaseline,
  validateAdminSystemTaxonomy,
} from "./domains/admin/system.ts";
import {
  getAdminTransaction,
  listAdminTransactions,
} from "./domains/admin/transactions.ts";
import {
  claimAdminWithdrawalRequest,
  createAdminPayoutMethodSensitiveAccess,
  createAdminWithdrawalSensitiveAccess,
  decideAdminPayoutMethod,
  getAdminPayoutMethod,
  getAdminWithdrawalRequest,
  listAdminPayoutMethods,
  listAdminWithdrawalRequests,
  resolveAdminWithdrawalRequest,
  releaseAdminWithdrawalRequest,
} from "./domains/admin/payout.ts";
import {
  claimAdminPaymentReconciliation,
  decideAdminPaymentReconciliation,
  getAdminPaymentReconciliation,
  getAdminWorkerFinanceSnapshot,
  getAdminFinanceSummary,
  listAdminPaymentReconciliations,
  releaseAdminPaymentReconciliation,
  recordAdminFinanceBalanceSnapshot,
} from "./domains/admin/finance.ts";
import {
  createWorkerWithdrawalRequest,
  getWorkerPayoutMethod,
  listWorkerWithdrawalRequests,
  saveWorkerPayoutMethod,
} from "./domains/worker/payout.ts";
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
import { requestJobMatchingRetry, getJobMatchingRetry, getJobMatchingOperation } from "./domains/matching/customer-retry.ts";
import { getJobMatchingPreferenceReceipt } from "./domains/matching/matching-preference-command.ts";
import {
  acceptBroadcast,
  confirmSearch,
  declineBroadcast,
} from "./domains/matching/flow.ts";
import { confirmWorkerCandidate, getWorkerCandidate, getWorkerCandidateDecision, rejectWorkerCandidate } from "./domains/matching/candidate.ts";
import { removeCustomerFavoriteWorker, saveCustomerFavoriteWorker } from "./domains/customer/favorite-worker.ts";
import {
  listFavoriteWorkersForMatching,
  setJobMatchingPreference,
} from "./domains/matching/matching-preference.ts";
import { createJob } from "./domains/job/create/create.ts";
import { updateJobStatus } from "./domains/job/status.ts";
import {
  confirmKaelChat,
  recoverKaelConfirmationOperation,
} from "./domains/kael-chat/confirm.service.ts";
import { getCustomerProfileInsights } from "./domains/customer/profile-insights.ts";
import { getWorkerPerformanceInsights } from "./domains/worker/profile-insights.ts";
import {
  getCustomerRefundAccount,
  saveCustomerRefundAccount,
} from "./domains/customer/refund-account.ts";
import { saveCustomerAddress } from "./domains/customer/address.ts";
import { deleteAccount } from "./domains/account/account-deletion.ts";

import type { MobileApiContext } from "./platform/auth.ts";
import type { MobileApiServices } from "./http/contracts.ts";

import { type EdgeAiSecrets, type EdgeGuardClient, getPublicKaelCharter } from "./kael/index.ts";
import type {
  PlatformManualBankConfig,
  SePayVietQrConfig,
} from "../../_shared/platform/env.ts";
import { harnessHealthPayload } from "../../_shared/harness/release.ts";
import type { HarnessEnvironmentDescriptor } from "../../_shared/harness/environment.ts";
import type { HarnessRuntimeRelease } from "../../_shared/harness/release.ts";
import { createProgramServices } from "./domains/program/services.ts";

export type EdgeServiceSecrets = EdgeAiSecrets & {
  manualBank?: PlatformManualBankConfig;
  sepayVietQr?: SePayVietQrConfig;
  harnessEnvironment?: HarnessEnvironmentDescriptor;
  harnessRelease?: HarnessRuntimeRelease;
};

export function createEdgeServices(secrets: EdgeServiceSecrets): MobileApiServices {
  return {
    getHarnessHealth: () => getHarnessHealth(secrets),
    ...createDiscoveryServices(secrets),
    ...createKaelChatServices(secrets),
    ...createJobWorkflowServices(secrets),
    ...createWorkerWorkflowServices(secrets),
    ...createProfileServices(secrets),
    ...createAdminNotificationServices(secrets),
    ...createProgramServices(),
  };
}

function createDiscoveryServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "listServices"
  | "getServiceCoverageReadiness"
  | "placesAutocomplete"
  | "placesResolve"
  | "createJob"
  | "getJob"
  | "listCustomerActiveJobs"
  | "listCustomerServiceHistory"
  | "listFavoriteWorkersForMatching"
> {
  return {
    listServices,
    getServiceCoverageReadiness,
    placesAutocomplete: (ctx, input) => placesAutocomplete(ctx, input, secrets),
    placesResolve: (ctx, input) => placesResolve(ctx, input, secrets),
    createJob: (ctx, input) => createJob(ctx, input, aiRuntime(ctx, secrets)),
    getJob: (ctx, jobId) => getJob(ctx, jobId, {
      paymentRailProvider: ctx.role === "customer" ? configuredPaymentRailProvider(secrets) : null,
    }),
    listCustomerActiveJobs: (ctx) => listCustomerActiveJobs(ctx, {
      paymentRailProvider: configuredPaymentRailProvider(secrets),
    }),
    listCustomerServiceHistory,
    listFavoriteWorkersForMatching,
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
  | "getKaelConfirmationOperation"
  | "submitKaelChatEvidence"
> {
  return {
    createKaelChat: (ctx, input) => createKaelChat(ctx, input, aiRuntime(ctx, secrets)),
    answerKaelAssistant: (ctx, input) => answerKaelAssistant(ctx, input, {
      ...aiRuntime(ctx, secrets),
      paymentRailAvailable: ctx.role === "customer" && configuredPaymentRailProvider(secrets) !== null,
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
    confirmKaelChat: (ctx, sessionId, input) =>
      confirmKaelChat(ctx, sessionId, input, aiRuntime(ctx, secrets)),
    getKaelConfirmationOperation: (ctx, sessionId) =>
      recoverKaelConfirmationOperation(ctx, sessionId, aiRuntime(ctx, secrets)),
    submitKaelChatEvidence: (ctx, sessionId, input) =>
      submitKaelChatEvidence(ctx, sessionId, input, aiRuntime(ctx, secrets)),
  };
}

function createJobWorkflowServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "confirmSearch"
  | "requestJobMatchingRetry"
  | "getJobMatchingRetry"
  | "getJobMatchingOperation"
  | "setJobMatchingPreference"
  | "getJobMatchingPreferenceReceipt"
  | "cancelJob"
  | "acceptBroadcast"
  | "declineBroadcast"
  | "getWorkerCandidate"
  | "getWorkerCandidateDecision"
  | "confirmWorkerCandidate"
  | "rejectWorkerCandidate"
  | "saveCustomerFavoriteWorker"
  | "removeCustomerFavoriteWorker"
  | "updateJobStatus"
  | "getRfqPrice"
  | "proposeRfqPrice"
  | "decideRfqPrice"
  | "authorizeApartmentAccess"
  | "requestScopeChange"
  | "getJobIncident"
  | "openJobIncident"
  | "previewScopeChangeFromJobIncident"
  | "proposeScopeChangeFromJobIncident"
> {
  return {
    confirmSearch,
    requestJobMatchingRetry,
    getJobMatchingRetry,
    getJobMatchingOperation,
    setJobMatchingPreference,
    getJobMatchingPreferenceReceipt,
    cancelJob,
    acceptBroadcast,
    declineBroadcast,
    getWorkerCandidate,
    getWorkerCandidateDecision,
    confirmWorkerCandidate,
    rejectWorkerCandidate,
    saveCustomerFavoriteWorker,
    removeCustomerFavoriteWorker,
    updateJobStatus,
    getRfqPrice,
    proposeRfqPrice,
    decideRfqPrice,
    authorizeApartmentAccess,
    requestScopeChange: (ctx, jobId, input) =>
      requestScopeChange(ctx, jobId, input, aiRuntime(ctx, secrets)),
    getJobIncident,
    openJobIncident: (ctx, jobId, input) =>
      openJobIncident(ctx, jobId, input, aiRuntime(ctx, secrets)),
    previewScopeChangeFromJobIncident: (ctx, jobId, input) =>
      previewScopeChangeFromJobIncident(ctx, jobId, input, aiRuntime(ctx, secrets)),
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
  | "createManualBankPaymentOrder"
  | "claimManualBankPayment"
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
    confirmCompletion: (ctx, jobId) =>
      confirmCompletionAndCreateManualBankOrder(ctx, jobId, secrets.manualBank),
    createManualBankPaymentOrder: (ctx, jobId) =>
      createManualBankPaymentOrder(ctx, jobId, secrets.manualBank),
    claimManualBankPayment,
    submitReview,
    submitCustomerKaelFeedback,
  };
}

function configuredPaymentRailProvider(
  secrets: EdgeServiceSecrets,
): "platform_bank_manual" | null {
  if (secrets.manualBank?.enabled) return "platform_bank_manual";
  return null;
}

function createProfileServices(secrets: EdgeServiceSecrets): Pick<
  MobileApiServices,
  | "getKaelCharter"
  | "getAdminActivation"
  | "activateAdminOperator"
  | "registerWorker"
  | "saveWorkerRegistrationDraft"
  | "submitWorkerRegistrationCommand"
  | "getWorkerRegistrationCommand"
  | "submitWorkerApplication"
  | "getWorkerReadiness"
  | "getCustomerProfileInsights"
  | "getCustomerAvatar"
  | "createCustomerAvatarUpload"
  | "updateCustomerAvatar"
  | "getCustomerRefundAccount"
  | "saveCustomerRefundAccount"
  | "saveCustomerAddress"
  | "deleteAccount"
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
  | "markWorkerBroadcastSeen"
  | "recordWorkerMatchingHeartbeat"
  | "submitWorkerMatchingProposal"
  | "listWorkerJobs"
  | "getWorkerRoutePreview"
  | "getWorkerRouteMap"
  | "getWorkerEarnings"
  | "getWorkerPayoutMethod"
  | "saveWorkerPayoutMethod"
  | "listWorkerWithdrawalRequests"
  | "createWorkerWithdrawalRequest"
> {
  return {
    getKaelCharter,
    getAdminActivation,
    activateAdminOperator,
    registerWorker,
    saveWorkerRegistrationDraft,
    submitWorkerRegistrationCommand,
    getWorkerRegistrationCommand,
    submitWorkerApplication,
    getWorkerReadiness,
    getCustomerProfileInsights,
    getCustomerAvatar,
    createCustomerAvatarUpload,
    updateCustomerAvatar,
    getCustomerRefundAccount,
    saveCustomerRefundAccount,
    saveCustomerAddress,
    deleteAccount,
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
    markWorkerBroadcastSeen,
    recordWorkerMatchingHeartbeat,
    submitWorkerMatchingProposal,
    listWorkerJobs,
    getWorkerPayoutMethod,
    saveWorkerPayoutMethod,
    listWorkerWithdrawalRequests,
    createWorkerWithdrawalRequest,
    getWorkerRoutePreview: (ctx, jobId, origin) =>
      getWorkerRoutePreview(ctx, jobId, origin, secrets),
    getWorkerRouteMap: (ctx, jobId, origin) =>
      getWorkerRouteMap(ctx, jobId, origin, secrets),
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
  | "getAdminActor"
  | "getAdminOperations"
  | "getAdminOverviewDetails"
  | "listAdminScopeChanges"
  | "getAdminScopeChange"
  | "createAdminScopeEvidenceAccess"
  | "listAdminSupportCases"
  | "getAdminSupportCase"
  | "updateAdminSupportCasePreparation"
  | "createAdminSupportEvidenceAccess"
  | "listAdminWorkflowRecoveryCases"
  | "getAdminWorkflowRecoveryCase"
  | "applyAdminWorkflowRecoveryAction"
  | "listAdminDisputes"
  | "listAdminPriceBaselines"
  | "listAdminAiCosts"
  | "listAdminLearningRules"
  | "listAdminServiceTaxonomy"
  | "listAdminSystemPriceBaselines"
  | "getAdminSystemPriceBaseline"
  | "listAdminSystemEvidencePackages"
  | "validateAdminSystemPriceBaseline"
  | "publishAdminSystemPriceBaseline"
  | "retireAdminSystemPriceBaseline"
  | "listAdminSystemTaxonomy"
  | "getAdminSystemTaxonomy"
  | "validateAdminSystemTaxonomy"
  | "updateAdminSystemTaxonomy"
  | "listAdminSystemLearningRules"
  | "getAdminSystemLearningRule"
  | "previewAdminSystemLearningAction"
  | "applyAdminSystemLearningAction"
  | "listAdminSystemModelHealth"
  | "getAdminSystemModelHealthDetail"
  | "listAdminWorkerApplications"
  | "getAdminWorkerApplication"
  | "getAdminWorkerReviewDetail"
  | "decideAdminWorkerProfile"
  | "decideAdminWorkerApplication"
  | "setAdminWorkerAccess"
  | "getAdminWorkerFinanceSnapshot"
  | "listAdminTransactions"
  | "getAdminTransaction"
  | "listAdminPayoutMethods"
  | "getAdminPayoutMethod"
  | "createAdminPayoutMethodSensitiveAccess"
  | "decideAdminPayoutMethod"
  | "listAdminWithdrawalRequests"
  | "getAdminWithdrawalRequest"
  | "createAdminWithdrawalSensitiveAccess"
  | "claimAdminWithdrawalRequest"
  | "releaseAdminWithdrawalRequest"
  | "resolveAdminWithdrawalRequest"
  | "listAdminPaymentReconciliations"
  | "getAdminPaymentReconciliation"
  | "claimAdminPaymentReconciliation"
  | "releaseAdminPaymentReconciliation"
  | "decideAdminPaymentReconciliation"
  | "getAdminFinanceSummary"
  | "recordAdminFinanceBalanceSnapshot"
  | "listAdminSubAdmins"
  | "provisionAdminOperator"
  | "resetPendingAdminOperatorPassword"
  | "searchAdminSubAdminAccounts"
  | "nominateAdminManager"
  | "cancelAdminManagerNomination"
  | "setAdminSubAdminAccess"
  | "listNotifications"
  | "markNotificationRead"
  | "acknowledgeMatchingPushDelivery"
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
    getAdminActor,
    getAdminOperations,
    getAdminOverviewDetails,
    listAdminScopeChanges,
    getAdminScopeChange,
    createAdminScopeEvidenceAccess,
    listAdminSupportCases,
    getAdminSupportCase,
    updateAdminSupportCasePreparation,
    createAdminSupportEvidenceAccess,
    listAdminWorkflowRecoveryCases,
    getAdminWorkflowRecoveryCase,
    applyAdminWorkflowRecoveryAction,
    listAdminDisputes,
    listAdminPriceBaselines,
    listAdminAiCosts,
    listAdminLearningRules,
    listAdminServiceTaxonomy,
    listAdminSystemPriceBaselines,
    getAdminSystemPriceBaseline,
    listAdminSystemEvidencePackages,
    validateAdminSystemPriceBaseline,
    publishAdminSystemPriceBaseline,
    retireAdminSystemPriceBaseline,
    listAdminSystemTaxonomy,
    getAdminSystemTaxonomy,
    validateAdminSystemTaxonomy,
    updateAdminSystemTaxonomy,
    listAdminSystemLearningRules,
    getAdminSystemLearningRule,
    previewAdminSystemLearningAction,
    applyAdminSystemLearningAction,
    listAdminSystemModelHealth,
    getAdminSystemModelHealthDetail,
    listAdminWorkerApplications,
    getAdminWorkerApplication,
    getAdminWorkerReviewDetail,
    decideAdminWorkerProfile,
    decideAdminWorkerApplication,
    setAdminWorkerAccess,
    getAdminWorkerFinanceSnapshot,
    listAdminTransactions,
    getAdminTransaction,
    listAdminPayoutMethods,
    getAdminPayoutMethod,
    createAdminPayoutMethodSensitiveAccess,
    decideAdminPayoutMethod,
    listAdminWithdrawalRequests,
    getAdminWithdrawalRequest,
    createAdminWithdrawalSensitiveAccess,
    claimAdminWithdrawalRequest,
    releaseAdminWithdrawalRequest,
    resolveAdminWithdrawalRequest,
    listAdminPaymentReconciliations,
    getAdminPaymentReconciliation,
    claimAdminPaymentReconciliation,
    releaseAdminPaymentReconciliation,
    decideAdminPaymentReconciliation,
    getAdminFinanceSummary,
    recordAdminFinanceBalanceSnapshot,
    listAdminSubAdmins,
    provisionAdminOperator,
    resetPendingAdminOperatorPassword,
    searchAdminSubAdminAccounts,
    nominateAdminManager,
    cancelAdminManagerNomination,
    setAdminSubAdminAccess,
    listNotifications,
    markNotificationRead,
    acknowledgeMatchingPushDelivery,
    registerDevicePushToken,
    unregisterDevicePushToken,
  };
}


function getHarnessHealth(secrets: EdgeServiceSecrets) {
  const environment = secrets.harnessEnvironment;
  const release = secrets.harnessRelease;
  if (!environment || !release) {
    return {
      service: "mobile-api",
      status: "degraded",
      environment: { name: "unknown", project_ref: null, host: null },
      release: {
        release_id: "unreleased",
        git_sha: "unknown",
        manifest_sha256: "unknown",
        bundle_sha256: "unknown",
        registered: false,
      },
    };
  }
  return harnessHealthPayload({ environment, release });
}

function getKaelCharter() {
  return getPublicKaelCharter();
}

function aiRuntime(
  ctx: MobileApiContext,
  secrets: EdgeServiceSecrets,
): EdgeAiSecrets {
  const trace = ctx.traceContext
    ? Object.freeze({
      ...ctx.traceContext,
      client: (ctx.privilegedSupabase ?? ctx.supabase) as EdgeGuardClient,
    })
    : undefined;
  return {
    ...secrets,
    ...(ctx.signal ? { requestSignal: ctx.signal } : {}),
    ...(secrets.durableGuardsEnabled
      ? { durableGuardClient: (ctx.privilegedSupabase ?? ctx.supabase) as EdgeGuardClient }
      : {}),
    ...(trace ? { harnessTrace: trace } : {}),
  };
}

export { buildCustomerProfileInsights } from "./domains/customer/profile-insights.ts";
export { buildWorkerPerformanceInsights } from "./domains/worker/profile-insights.ts";
import { getRfqPrice, proposeRfqPrice, decideRfqPrice } from "./domains/job/rfq-price.ts";
