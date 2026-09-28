import type { EdgeRfqPriceProposalInput as RfqPriceProposalInput, EdgeRfqPriceDecisionInput as RfqPriceDecisionInput,
  EdgeRfqPriceProposal as RfqPriceProposal, EdgeRfqPriceStatus as RfqPriceStatus } from "../../../_shared/contracts/rfq-price.ts";
import type {
  EdgeApartmentAccessAuthorizationInput,
  EdgeApartmentAccessAuthorizationReceipt,
  EdgeCandidateDecisionStatus,
} from "../../../_shared/contracts/job.ts";
import type {
  AvailabilityToggleInput,
  AccountDeletionRequest,
  EdgeCustomerAvatarUpdateInput,
  EdgeCustomerAvatarUploadInput,
  CustomerCancellationRequestInput,
  CustomerRefundAccountSaveRequest,
  EdgeCustomerKaelConversationCreateInput,
  EdgeCustomerKaelConversationMode,
  EdgeCustomerKaelConversationTurnInput,
  CustomerKaelFeedbackInput,
  CustomerScopeDecisionInput,
  DevicePushTokenInput,
  EdgeMatchingPushDeliveryAckInput,
  EdgeDevicePushTokenUnregisterInput,
  DisputeAdminDecisionInput,
  DisputeCounterStatementInput,
  DisputeOpenRequestInput,
  JobCreateInput,
  EdgeJobMatchingPreferenceInput,
  EdgeServiceCoverageReadiness,
  EdgeJobIncidentScopeProposalInput,
  EdgeJobIncidentScopePricePreviewInput,
  JobMediaAttachInput,
  JobMessageSendInput,
  JobStatus,
  KaelAssistantInput,
  KaelChatCreateInput,
  EdgeKaelChatConfirmInput,
  EdgeKaelChatIntakeConfirmationDecisionInput,
  KaelChatEvidenceInput,
  EdgeKaelChatMediaRevokeInput,
  EdgeKaelChatMediaUploadInput,
  KaelChatTurnInput,
  KaelWorkerClarifyInput,
  PlacesAutocompleteInput,
  PlacesResolveInput,
  ReviewInput,
  ServiceType,
  UpdateKaelMemoryInput,
  UserRole,
  WorkerApplicationSubmitInput,
  EdgeWorkerAvatarUpdateInput,
  EdgeWorkerAvatarUploadInput,
  WorkerCancellationRequestInput,
  WorkerKaelChatCreateInput,
  EdgeWorkerKaelChatPinInput,
  EdgeWorkerKaelChatRenameInput,
  EdgeCustomerKaelConversationPinInput,
  EdgeCustomerKaelConversationRenameInput,
  WorkerKaelChatTurnInput,
  WorkerKaelFeedbackInput,
  WorkerKaelTrainingConsentInput,
  WorkerRegisterInput,
  EdgeWorkerRegistrationDraftInput,
  WorkerServiceAreaUpdateInput,
  WorkerServicePreferencesUpdateInput,
  WorkerKaelMemoryPreferenceUpdateInput,
  WorkerScopeChangeInput,
} from "../../../_shared/domain.ts";
import type {
  EdgeWorkerWithdrawalRequestCreateInput,
  WorkerPayoutMethodSaveRequest,
} from "../../../_shared/worker-payout-contract.ts";
import type {
  JobMediaRevokeInput,
  JobMediaRevokeResponse,
  JobMediaUploadInput,
  JobMediaUploadResponse,
} from "../../../_shared/job-media-contract.ts";
import type { KaelPublicCharterResponse, PriceSynthesisAbCaseInput, PriceSynthesisAbEvaluation } from "../platform/kael-contracts.ts";
import type { MobileApiAuthResult, MobileApiContext } from "../platform/auth.ts";
import type { PlacesAutocompleteResponse } from "../domains/contracts/catalog.ts";
import type {
  EdgeJobIncidentScopePricePreviewResponse,
  WorkerRouteOrigin,
  WorkerStatusUpdateInput,
  WorkerWorkSessionSnapshot,
} from "../domains/contracts/worker.ts";
import type { EdgeAccountDeletionResponse } from "../domains/contracts/account.ts";
import type { EdgeMatchingRetryRequest, EdgeMatchingRetryReceipt, EdgeMatchingOperationSnapshot, EdgeMatchingSelectionReceipt } from "../../../_shared/contracts/stage1-reliability.ts";
import type {
  EdgeCompletionPaymentResponse,
  EdgeManualBankClaimResponse,
  EdgeManualBankPaymentResponse,
  ManualBankClaimInput,
} from "../domains/payment/manual-bank.ts";
import type {
  EdgeAcceptBroadcastResponse,
  EdgeConfirmWorkerCandidateResponse,
  EdgeAvailabilityToggleResponse,
  EdgeBroadcastListResponse,
  EdgeConfirmSearchResponse,
  EdgeFavoriteWorkersForMatchingResponse,
  EdgeCreateJobResponse,
  EdgeCustomerActiveJobResponse,
  EdgeCustomerCancellationResponse,
  EdgeCustomerAvatarResponse,
  EdgeCustomerAvatarUploadResponse,
  EdgeCustomerKaelFeedbackResponse,
  EdgeCustomerProfileInsightsResponse,
  EdgeCustomerRefundAccountResponse,
  EdgeCustomerFavoriteWorkerResponse,
  EdgeCustomerScopeDecisionResponse,
  EdgeDeclineBroadcastResponse,
  EdgeDevicePushTokenResponse,
  EdgeDisputeAdminDecisionResponse,
  EdgeDisputeCounterStatementResponse,
  EdgeDisputeOpenResponse,
  EdgeEarningsResponse,
  EdgeJobDetailResponse,
  EdgeJobIncidentResponse,
  EdgeJobIncidentScopeProposalResponse,
  EdgeJobMediaAttachResponse,
  EdgeJobMessageListResponse,
  EdgeJobMessageSendResponse,
  EdgeMatchingPreferenceResponse,
  EdgeKaelAssistantResponse,
  EdgeKaelChatMediaUploadResponse,
  KaelBatchResultsProcessInput,
  KaelBatchResultsProcessResponse,
  EdgeKaelChatProgressResponse,
  EdgeKaelChatResponse,
  KaelLearningCandidateApproveResponse,
  KaelLearningCandidateListInput,
  KaelLearningCandidateListResponse,
  KaelLearningCandidateRejectResponse,
  KaelLearningCandidateReviewInput,
  KaelLearningMonitorInput,
  KaelLearningMonitorResponse,
  KaelLearningQueueProcessInput,
  KaelLearningQueueProcessResponse,
  MarketCacheInvalidateInput,
  MarketCacheInvalidateResponse,
  EdgeNotificationListResponse,
  EdgeNotificationReadResponse,
  EdgePlacesResolveResponse,
  EdgeReviewResponse,
  EdgeServiceCatalogResponse,
  EdgeStatusUpdateResponse,
  EdgeWorkerCancellationResponse,
  EdgeWorkerApplicationResponse,
  EdgeWorkerCandidateResponse,
  EdgeWorkerJobListResponse,
  EdgeWorkerKaelClarifyResponse,
  EdgeWorkerKaelFeedbackResponse,
  EdgeWorkerKaelTrainingConsentResponse,
  EdgeWorkerPerformanceInsightsResponse,
  EdgeWorkerProfileResponse,
  EdgeWorkerReadinessResponse,
  EdgeWorkerAvatarUploadResponse,
  EdgeWorkerAvatarUpdateResponse,
  EdgeWorkerActivityMinuteResponse,
  EdgeWorkerRegisterResponse,
  EdgeWorkerRoutePreviewResponse,
  EdgeWorkerMatchingProposalInput,
  EdgeWorkerMatchingProposalResponse,
  EdgeWorkerScopeChangeResponse,
  EdgeRejectWorkerCandidateResponse,
} from "./dtos.ts";
import type { EdgeCustomerServiceHistoryResponse } from "./job-history-dtos.ts";
import type {
  EdgeCustomerKaelConversationArchiveResponse,
  EdgeCustomerKaelConversationListResponse,
  EdgeCustomerKaelConversationResponse,
} from "./customer-kael-conversation-dtos.ts";
import type {
  EdgeWorkerKaelChatArchiveResponse,
  EdgeWorkerKaelChatListResponse,
  EdgeWorkerKaelChatResponse,
} from "./worker-kael-chat-dtos.ts";
import type {
  EdgeDevicePushTokenUnregisterResponse,
  EdgeMatchingPushDeliveryAckResponse,
} from "./notification-device.dtos.ts";
import type {
  EdgeWorkerPayoutMethodResponse,
  EdgeWorkerWithdrawalRequestCreateResponse,
  EdgeWorkerWithdrawalRequestListResponse,
} from "../domains/contracts/worker-payout.ts";
import type { AdminControlServices } from "./routes/admin-control-services-contract.ts";
import type { ProgramServices } from "./routes/program-services-contract.ts";
import type {
  EdgeKaelMemoryDeleteResponse,
  EdgeKaelMemorySelfViewResponse,
  EdgePendingDecisionsResponse,
  EdgeThreadsResponse,
} from "./response-contracts.ts";
import type {
  AdminActivationResponse,
  AdminActivationStatusResponse,
  EdgeAdminOperatorActivationInput,
} from "../domains/contracts/admin-activation.ts";
export * from "./contract-reexports.ts";

export type MobileApiServices = AdminControlServices & ProgramServices & {
  getAdminActivation(ctx: MobileApiContext): Promise<AdminActivationStatusResponse>;
  activateAdminOperator(
    ctx: MobileApiContext,
    input: EdgeAdminOperatorActivationInput,
  ): Promise<AdminActivationResponse>;
  getHarnessHealth?(): Promise<Record<string, unknown>> | Record<string, unknown>;
  getKaelCharter(): Promise<KaelPublicCharterResponse> | KaelPublicCharterResponse;
  listServices(ctx: MobileApiContext): Promise<EdgeServiceCatalogResponse>;
  getServiceCoverageReadiness(
    ctx: MobileApiContext,
    input: { serviceType: ServiceType; districtCode: string },
  ): Promise<EdgeServiceCoverageReadiness>;
  placesAutocomplete(
    ctx: MobileApiContext,
    input: PlacesAutocompleteInput,
  ): Promise<PlacesAutocompleteResponse>;
  placesResolve(
    ctx: MobileApiContext,
    input: PlacesResolveInput,
  ): Promise<EdgePlacesResolveResponse>;
  createJob(
    ctx: MobileApiContext,
    input: JobCreateInput,
  ): Promise<EdgeCreateJobResponse>;
  getJob(ctx: MobileApiContext, jobId: string): Promise<EdgeJobDetailResponse>;
  listCustomerActiveJobs(
    ctx: MobileApiContext,
  ): Promise<EdgeCustomerActiveJobResponse>;
  listCustomerServiceHistory(
    ctx: MobileApiContext,
  ): Promise<EdgeCustomerServiceHistoryResponse>;
  listFavoriteWorkersForMatching(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeFavoriteWorkersForMatchingResponse>;
  createKaelChat(
    ctx: MobileApiContext,
    input: KaelChatCreateInput,
  ): Promise<EdgeKaelChatResponse>;
  answerKaelAssistant(
    ctx: MobileApiContext,
    input: KaelAssistantInput,
  ): Promise<EdgeKaelAssistantResponse>;
  createCustomerKaelConversation(
    ctx: MobileApiContext,
    input: EdgeCustomerKaelConversationCreateInput,
  ): Promise<EdgeCustomerKaelConversationResponse>;
  listCustomerKaelConversations(
    ctx: MobileApiContext,
    mode: EdgeCustomerKaelConversationMode,
  ): Promise<EdgeCustomerKaelConversationListResponse>;
  archiveCustomerKaelConversation(
    ctx: MobileApiContext,
    conversationId: string,
    confirmCaseWork: boolean,
  ): Promise<EdgeCustomerKaelConversationArchiveResponse>;
  renameCustomerKaelConversation(
    ctx: MobileApiContext,
    conversationId: string,
    input: EdgeCustomerKaelConversationRenameInput,
  ): Promise<EdgeCustomerKaelConversationResponse>;
  setCustomerKaelConversationPinned(
    ctx: MobileApiContext,
    conversationId: string,
    input: EdgeCustomerKaelConversationPinInput,
  ): Promise<EdgeCustomerKaelConversationResponse>;
  getCustomerKaelConversation(
    ctx: MobileApiContext,
    conversationId: string,
  ): Promise<EdgeCustomerKaelConversationResponse>;
  sendCustomerKaelConversationTurn(
    ctx: MobileApiContext,
    conversationId: string,
    input: EdgeCustomerKaelConversationTurnInput,
  ): Promise<EdgeCustomerKaelConversationResponse>;
  streamCustomerKaelConversationTurn(
    ctx: MobileApiContext,
    conversationId: string,
    input: EdgeCustomerKaelConversationTurnInput,
  ): Promise<Response> | Response;
  createKaelChatMediaUpload(
    ctx: MobileApiContext,
    input: EdgeKaelChatMediaUploadInput,
  ): Promise<EdgeKaelChatMediaUploadResponse>;
  revokeKaelChatMedia(
    ctx: MobileApiContext,
    input: EdgeKaelChatMediaRevokeInput,
  ): Promise<{ revoked_count: number; deletion_pending: boolean }>;
  getKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<EdgeKaelChatResponse>;
  getKaelChatProgress(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<EdgeKaelChatProgressResponse>;
  streamKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatTurnInput,
  ): Promise<Response> | Response;
  streamKaelChatEvidence(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatEvidenceInput,
  ): Promise<Response> | Response;
  sendKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatTurnInput,
  ): Promise<EdgeKaelChatResponse>;
  decideKaelIntakeConfirmation(
    ctx: MobileApiContext,
    sessionId: string,
    input: EdgeKaelChatIntakeConfirmationDecisionInput,
  ): Promise<EdgeKaelChatResponse>;
  confirmKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
    input: EdgeKaelChatConfirmInput,
  ): Promise<EdgeConfirmSearchResponse & { session_id: string }>;
  getKaelConfirmationOperation(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<Record<string, unknown>>;
  submitKaelChatEvidence(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatEvidenceInput,
  ): Promise<EdgeKaelChatResponse>;
  confirmSearch(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeConfirmSearchResponse>;
  requestJobMatchingRetry(ctx: MobileApiContext, jobId: string, input: EdgeMatchingRetryRequest): Promise<{ operation: EdgeMatchingRetryReceipt }>;
  getJobMatchingRetry(ctx: MobileApiContext, jobId: string, requestId: string): Promise<{ operation: EdgeMatchingRetryReceipt }>;
  getJobMatchingOperation(ctx: MobileApiContext, jobId: string): Promise<{ job_id: string; operation: EdgeMatchingOperationSnapshot | null }>;
  getJobMatchingPreferenceReceipt(ctx: MobileApiContext, jobId: string, requestId: string): Promise<{ selection: EdgeMatchingSelectionReceipt }>;
  setJobMatchingPreference(
    ctx: MobileApiContext,
    jobId: string,
    input: EdgeJobMatchingPreferenceInput,
  ): Promise<EdgeMatchingPreferenceResponse>;
  cancelJob(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<{ job_id: string; status: JobStatus }>;
  acceptBroadcast(
    ctx: MobileApiContext,
    jobId: string,
    quoteId: string,
  ): Promise<EdgeAcceptBroadcastResponse>;
  declineBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeDeclineBroadcastResponse>;
  getWorkerCandidate(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeWorkerCandidateResponse>;
  getWorkerCandidateDecision(
    ctx: MobileApiContext,
    jobId: string,
    candidateId: string,
  ): Promise<EdgeCandidateDecisionStatus>;
  confirmWorkerCandidate(
    ctx: MobileApiContext,
    jobId: string,
    candidateId: string,
  ): Promise<EdgeConfirmWorkerCandidateResponse>;
  rejectWorkerCandidate(
    ctx: MobileApiContext,
    jobId: string,
    candidateId: string,
  ): Promise<EdgeRejectWorkerCandidateResponse>;
  saveCustomerFavoriteWorker?(
    ctx: MobileApiContext,
    workerId: string,
  ): Promise<EdgeCustomerFavoriteWorkerResponse>;
  removeCustomerFavoriteWorker?(
    ctx: MobileApiContext,
    workerId: string,
  ): Promise<EdgeCustomerFavoriteWorkerResponse>;
  getRfqPrice(ctx: MobileApiContext, jobId: string): Promise<RfqPriceStatus>;
  proposeRfqPrice(ctx: MobileApiContext, jobId: string, input: RfqPriceProposalInput): Promise<RfqPriceProposal>;
  decideRfqPrice(ctx: MobileApiContext, jobId: string, input: RfqPriceDecisionInput): Promise<RfqPriceProposal>;
  updateJobStatus(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerStatusUpdateInput,
  ): Promise<EdgeStatusUpdateResponse>;
  authorizeApartmentAccess(
    ctx: MobileApiContext,
    jobId: string,
    input?: EdgeApartmentAccessAuthorizationInput,
  ): Promise<EdgeApartmentAccessAuthorizationReceipt>;
  requestScopeChange(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerScopeChangeInput,
  ): Promise<EdgeWorkerScopeChangeResponse>;
  getJobIncident(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeJobIncidentResponse>;
  openJobIncident(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerScopeChangeInput,
  ): Promise<EdgeJobIncidentResponse>;
  proposeScopeChangeFromJobIncident(
    ctx: MobileApiContext,
    jobId: string,
    input: EdgeJobIncidentScopeProposalInput,
  ): Promise<EdgeJobIncidentScopeProposalResponse>;
  previewScopeChangeFromJobIncident(
    ctx: MobileApiContext,
    jobId: string,
    input: EdgeJobIncidentScopePricePreviewInput,
  ): Promise<EdgeJobIncidentScopePricePreviewResponse>;
  askKaelForWorker(
    ctx: MobileApiContext,
    jobId: string,
    input: KaelWorkerClarifyInput,
  ): Promise<EdgeWorkerKaelClarifyResponse>;
  createWorkerKaelChat(
    ctx: MobileApiContext,
    input: WorkerKaelChatCreateInput,
  ): Promise<EdgeWorkerKaelChatResponse>;
  listWorkerKaelChats(
    ctx: MobileApiContext,
    mode: WorkerKaelChatCreateInput["mode"],
  ): Promise<EdgeWorkerKaelChatListResponse>;
  archiveWorkerKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<EdgeWorkerKaelChatArchiveResponse>;
  setWorkerKaelChatPinned(
    ctx: MobileApiContext,
    sessionId: string,
    input: EdgeWorkerKaelChatPinInput,
  ): Promise<EdgeWorkerKaelChatResponse>;
  renameWorkerKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
    input: EdgeWorkerKaelChatRenameInput,
  ): Promise<EdgeWorkerKaelChatResponse>;
  getWorkerKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<EdgeWorkerKaelChatResponse>;
  sendWorkerKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: WorkerKaelChatTurnInput,
  ): Promise<EdgeWorkerKaelChatResponse>;
  streamWorkerKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: WorkerKaelChatTurnInput,
  ): Promise<Response> | Response;
  submitWorkerKaelFeedback(
    ctx: MobileApiContext,
    input: WorkerKaelFeedbackInput,
  ): Promise<EdgeWorkerKaelFeedbackResponse>;
  getWorkerKaelTrainingConsent(
    ctx: MobileApiContext,
  ): Promise<EdgeWorkerKaelTrainingConsentResponse>;
  setWorkerKaelTrainingConsent(
    ctx: MobileApiContext,
    input: WorkerKaelTrainingConsentInput,
  ): Promise<EdgeWorkerKaelTrainingConsentResponse>;
  requestWorkerCancellation(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerCancellationRequestInput,
  ): Promise<EdgeWorkerCancellationResponse>;
  requestCustomerCancellation(
    ctx: MobileApiContext,
    jobId: string,
    input: CustomerCancellationRequestInput,
  ): Promise<EdgeCustomerCancellationResponse>;
  openDispute(
    ctx: MobileApiContext,
    jobId: string,
    input: DisputeOpenRequestInput,
  ): Promise<EdgeDisputeOpenResponse>;
  submitDisputeCounterStatement(
    ctx: MobileApiContext,
    disputeId: string,
    input: DisputeCounterStatementInput,
  ): Promise<EdgeDisputeCounterStatementResponse>;
  decideDispute(
    ctx: MobileApiContext,
    disputeId: string,
    input: DisputeAdminDecisionInput,
  ): Promise<EdgeDisputeAdminDecisionResponse>;
  attachJobMedia(
    ctx: MobileApiContext,
    jobId: string,
    input: JobMediaAttachInput,
  ): Promise<EdgeJobMediaAttachResponse>;
  createJobMediaUpload(
    ctx: MobileApiContext,
    jobId: string,
    input: JobMediaUploadInput,
  ): Promise<JobMediaUploadResponse>;
  revokeJobMediaUploads(
    ctx: MobileApiContext,
    jobId: string,
    input: JobMediaRevokeInput,
  ): Promise<JobMediaRevokeResponse>;
  listJobMessages(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeJobMessageListResponse>;
  sendJobMessage(
    ctx: MobileApiContext,
    jobId: string,
    input: JobMessageSendInput,
  ): Promise<EdgeJobMessageSendResponse>;
  decideScopeChange(
    ctx: MobileApiContext,
    scopeChangeId: string,
    input: CustomerScopeDecisionInput,
  ): Promise<EdgeCustomerScopeDecisionResponse>;
  confirmCompletion(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeCompletionPaymentResponse>;
  createManualBankPaymentOrder(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeManualBankPaymentResponse>;
  claimManualBankPayment(
    ctx: MobileApiContext,
    jobId: string,
    input: ManualBankClaimInput,
  ): Promise<EdgeManualBankClaimResponse>;
  submitReview(
    ctx: MobileApiContext,
    jobId: string,
    input: Omit<ReviewInput, "job_id">,
  ): Promise<EdgeReviewResponse>;
  submitCustomerKaelFeedback(
    ctx: MobileApiContext,
    input: CustomerKaelFeedbackInput,
  ): Promise<EdgeCustomerKaelFeedbackResponse>;
  registerWorker(
    ctx: MobileApiContext,
    input: WorkerRegisterInput,
  ): Promise<EdgeWorkerRegisterResponse>;
  submitWorkerRegistrationCommand(
    ctx: MobileApiContext,
    input: import("../../../_shared/contracts/worker.ts").EdgeWorkerRegistrationCommandInput,
  ): Promise<import("../../../_shared/contracts/worker.ts").EdgeWorkerRegistrationCommandResult>;
  getWorkerRegistrationCommand(
    ctx: MobileApiContext,
    clientRequestId: string,
  ): Promise<import("../../../_shared/contracts/worker.ts").EdgeWorkerRegistrationCommandResult>;
  saveWorkerRegistrationDraft(
    ctx: MobileApiContext,
    input: EdgeWorkerRegistrationDraftInput,
  ): Promise<{
    worker_id: string;
    verification_status: import("../../../_shared/domain.ts").WorkerVerificationStatus;
    updated_at: string;
  }>;
  submitWorkerApplication(
    ctx: MobileApiContext,
    input: WorkerApplicationSubmitInput,
  ): Promise<EdgeWorkerApplicationResponse>;
  getWorkerReadiness(ctx: MobileApiContext): Promise<EdgeWorkerReadinessResponse>;
  getMyKaelMemory(ctx: MobileApiContext): Promise<EdgeKaelMemorySelfViewResponse>;
  getWorkerKaelMemory(ctx: MobileApiContext): Promise<EdgeKaelMemorySelfViewResponse>;
  deleteMyKaelMemory(ctx: MobileApiContext): Promise<EdgeKaelMemoryDeleteResponse>;
  updateMyKaelMemory(
    ctx: MobileApiContext,
    input: UpdateKaelMemoryInput,
  ): Promise<EdgeKaelMemorySelfViewResponse>;
  updateWorkerKaelMemoryPreference(
    ctx: MobileApiContext,
    input: WorkerKaelMemoryPreferenceUpdateInput,
  ): Promise<EdgeKaelMemorySelfViewResponse>;
  listMyPendingDecisions(ctx: MobileApiContext): Promise<EdgePendingDecisionsResponse>;
  listMyThreads(ctx: MobileApiContext): Promise<EdgeThreadsResponse>;
  getCustomerProfileInsights(
    ctx: MobileApiContext,
  ): Promise<EdgeCustomerProfileInsightsResponse>;
  getCustomerAvatar(ctx: MobileApiContext): Promise<EdgeCustomerAvatarResponse>;
  createCustomerAvatarUpload(
    ctx: MobileApiContext,
    input: EdgeCustomerAvatarUploadInput,
  ): Promise<EdgeCustomerAvatarUploadResponse>;
  updateCustomerAvatar(
    ctx: MobileApiContext,
    input: EdgeCustomerAvatarUpdateInput,
  ): Promise<EdgeCustomerAvatarResponse>;
  getCustomerRefundAccount(
    ctx: MobileApiContext,
  ): Promise<EdgeCustomerRefundAccountResponse>;
  saveCustomerRefundAccount(
    ctx: MobileApiContext,
    input: CustomerRefundAccountSaveRequest,
  ): Promise<EdgeCustomerRefundAccountResponse>;
  saveCustomerAddress(ctx: MobileApiContext, input: { default_address: string }): Promise<EdgeCustomerProfileInsightsResponse>;
  deleteAccount?(
    ctx: MobileApiContext,
    input: AccountDeletionRequest,
  ): Promise<EdgeAccountDeletionResponse>;
  getWorkerProfile(ctx: MobileApiContext): Promise<EdgeWorkerProfileResponse>;
  createWorkerAvatarUpload(
    ctx: MobileApiContext,
    input: EdgeWorkerAvatarUploadInput,
  ): Promise<EdgeWorkerAvatarUploadResponse>;
  updateWorkerAvatar(
    ctx: MobileApiContext,
    input: EdgeWorkerAvatarUpdateInput,
  ): Promise<EdgeWorkerAvatarUpdateResponse>;
  recordWorkerAppActiveMinute(
    ctx: MobileApiContext,
  ): Promise<EdgeWorkerActivityMinuteResponse>;
  getWorkerPerformanceInsights(
    ctx: MobileApiContext,
  ): Promise<EdgeWorkerPerformanceInsightsResponse>;
  updateWorkerServiceArea(
    ctx: MobileApiContext,
    input: WorkerServiceAreaUpdateInput,
  ): Promise<EdgeWorkerProfileResponse>;
  updateWorkerServicePreferences(
    ctx: MobileApiContext,
    input: WorkerServicePreferencesUpdateInput,
  ): Promise<EdgeWorkerProfileResponse>;
  updateWorkerAvailability(
    ctx: MobileApiContext,
    input: AvailabilityToggleInput,
  ): Promise<EdgeAvailabilityToggleResponse>;
  listWorkerBroadcasts(ctx: MobileApiContext): Promise<EdgeBroadcastListResponse>;
  recordWorkerMatchingHeartbeat(
    ctx: MobileApiContext,
  ): Promise<{ server_time: string; active_until: string | null }>;
  markWorkerBroadcastSeen(
    ctx: MobileApiContext,
    broadcastId: string,
  ): Promise<Record<string, unknown>>;
  submitWorkerMatchingProposal(
    ctx: MobileApiContext,
    broadcastId: string,
    input: EdgeWorkerMatchingProposalInput,
  ): Promise<EdgeWorkerMatchingProposalResponse>;
  listWorkerJobs(ctx: MobileApiContext): Promise<EdgeWorkerJobListResponse>;
  getWorkerRoutePreview(
    ctx: MobileApiContext,
    jobId: string,
    origin: WorkerRouteOrigin,
  ): Promise<EdgeWorkerRoutePreviewResponse>;
  getWorkerRouteMap(
    ctx: MobileApiContext,
    jobId: string,
    origin: WorkerRouteOrigin | null,
  ): Promise<Response>;
  getWorkerEarnings(
    ctx: MobileApiContext,
    range: { from?: string; to?: string },
  ): Promise<EdgeEarningsResponse>;
  getWorkerPayoutMethod(
    ctx: MobileApiContext,
  ): Promise<EdgeWorkerPayoutMethodResponse>;
  saveWorkerPayoutMethod(
    ctx: MobileApiContext,
    input: WorkerPayoutMethodSaveRequest,
  ): Promise<EdgeWorkerPayoutMethodResponse>;
  listWorkerWithdrawalRequests(
    ctx: MobileApiContext,
  ): Promise<EdgeWorkerWithdrawalRequestListResponse>;
  createWorkerWithdrawalRequest(
    ctx: MobileApiContext,
    input: EdgeWorkerWithdrawalRequestCreateInput,
  ): Promise<EdgeWorkerWithdrawalRequestCreateResponse>;
  invalidateMarketCache(
    ctx: MobileApiContext,
    input: MarketCacheInvalidateInput,
  ): Promise<MarketCacheInvalidateResponse>;
  evaluatePriceSynthesisAbCase(
    ctx: MobileApiContext,
    input: PriceSynthesisAbCaseInput,
  ): Promise<PriceSynthesisAbEvaluation>;
  processKaelLearningQueue(
    ctx: MobileApiContext,
    input: KaelLearningQueueProcessInput,
  ): Promise<KaelLearningQueueProcessResponse>;
  processKaelBatchResults(
    ctx: MobileApiContext,
    input: KaelBatchResultsProcessInput,
  ): Promise<KaelBatchResultsProcessResponse>;
  monitorKaelLearningRules(
    ctx: MobileApiContext,
    input: KaelLearningMonitorInput,
  ): Promise<KaelLearningMonitorResponse>;
  listKaelLearningCandidates(
    ctx: MobileApiContext,
    input: KaelLearningCandidateListInput,
  ): Promise<KaelLearningCandidateListResponse>;
  approveKaelLearningCandidate(
    ctx: MobileApiContext,
    candidateId: string,
    input: KaelLearningCandidateReviewInput,
  ): Promise<KaelLearningCandidateApproveResponse>;
  rejectKaelLearningCandidate(
    ctx: MobileApiContext,
    candidateId: string,
    input: KaelLearningCandidateReviewInput,
  ): Promise<KaelLearningCandidateRejectResponse>;
  listNotifications(ctx: MobileApiContext): Promise<EdgeNotificationListResponse>;
  markNotificationRead(
    ctx: MobileApiContext,
    notificationId: string,
  ): Promise<EdgeNotificationReadResponse>;
  registerDevicePushToken(
    ctx: MobileApiContext,
    input: DevicePushTokenInput,
  ): Promise<EdgeDevicePushTokenResponse>;
  unregisterDevicePushToken(
    ctx: MobileApiContext,
    input: EdgeDevicePushTokenUnregisterInput,
  ): Promise<EdgeDevicePushTokenUnregisterResponse>;
  acknowledgeMatchingPushDelivery(
    ctx: MobileApiContext,
    input: EdgeMatchingPushDeliveryAckInput,
  ): Promise<EdgeMatchingPushDeliveryAckResponse>;
};

export type MobileApiHandlerDeps = {
  authenticate(
    request: Request,
    allowedRoles?: UserRole[],
  ): Promise<MobileApiAuthResult>;
  services: MobileApiServices;
  releaseId?: string;
  environment?: "local" | "preview" | "staging" | "production";
  minimumClientBuildNumber?: number | null;
  clientCompatibility?: import("../../../_shared/platform/env.ts").MobileClientCompatibility;
};
