import type {
  AvailabilityToggleInput,
  CustomerCancellationRequestInput,
  EdgeCustomerKaelConversationCreateInput,
  EdgeCustomerKaelConversationMode,
  EdgeCustomerKaelConversationTurnInput,
  CustomerKaelFeedbackInput,
  CustomerScopeDecisionInput,
  DevicePushTokenInput,
  EdgeDevicePushTokenUnregisterInput,
  DisputeAdminDecisionInput,
  DisputeCounterStatementInput,
  DisputeOpenRequestInput,
  JobCreateInput,
  EdgeJobIncidentScopeProposalInput,
  JobMediaAttachInput,
  JobMessageSendInput,
  JobStatus,
  KaelAssistantInput,
  KaelChatCreateInput,
  KaelChatEvidenceInput,
  EdgeKaelChatMediaRevokeInput,
  EdgeKaelChatMediaUploadInput,
  KaelChatTurnInput,
  KaelWorkerClarifyInput,
  PlacesAutocompleteInput,
  PlacesResolveInput,
  ReviewInput,
  UpdateKaelMemoryInput,
  UserRole,
  WorkerApplicationSubmitInput,
  EdgeWorkerAvatarUpdateInput,
  EdgeWorkerAvatarUploadInput,
  WorkerCancellationDecisionInput,
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
  WorkerServiceAreaUpdateInput,
  WorkerScopeChangeInput,
} from "../../../_shared/domain.ts";
import type {
  JobMediaRevokeInput,
  JobMediaRevokeResponse,
  JobMediaUploadInput,
  JobMediaUploadResponse,
} from "../../../_shared/job-media-contract.ts";
import type { KaelPublicCharterResponse } from "../kael/system-prompt.ts";
import type {
  PriceSynthesisAbCaseInput,
  PriceSynthesisAbEvaluation,
} from "../kael/price-synthesis-ab.ts";
import type {
  EdgeAcceptBroadcastResponse,
  EdgeConfirmWorkerCandidateResponse,
  EdgeAvailabilityToggleResponse,
  EdgeBroadcastListResponse,
  EdgeConfirmCompletionResponse,
  EdgeConfirmSearchResponse,
  EdgeCreateJobResponse,
  EdgeCustomerActiveJobResponse,
  EdgeCustomerCancellationResponse,
  EdgeCustomerKaelFeedbackResponse,
  EdgeCustomerProfileInsightsResponse,
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
  EdgeWorkerCancellationDecisionResponse,
  EdgeWorkerCancellationResponse,
  EdgeWorkerApplicationResponse,
  EdgeWorkerCandidateResponse,
  EdgeWorkerJobListResponse,
  EdgeWorkerKaelClarifyResponse,
  EdgeWorkerKaelFeedbackResponse,
  EdgeWorkerKaelTrainingConsentResponse,
  EdgeWorkerPerformanceInsightsResponse,
  EdgeWorkerProfileResponse,
  EdgeWorkerAvatarUploadResponse,
  EdgeWorkerAvatarUpdateResponse,
  EdgeWorkerActivityMinuteResponse,
  EdgeWorkerRegisterResponse,
  EdgeWorkerRoutePreviewResponse,
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
} from "./notification-device.dtos.ts";
export type {
  KaelBatchResultsProcessInput,
  KaelBatchResultsProcessResponse,
  KaelLearningCandidateApproveResponse,
  KaelLearningCandidateListInput,
  KaelLearningCandidateListResponse,
  KaelLearningCandidateReviewInput,
  KaelLearningCandidateRejectResponse,
  KaelLearningCandidateSummary,
  KaelLearningMonitorInput,
  KaelLearningMonitorResponse,
  KaelLearningQueueProcessInput,
  KaelLearningQueueProcessResponse,
  MarketCacheInvalidateInput,
  MarketCacheInvalidateResponse,
} from "./dtos.ts";

export type MobileApiAuthResult =
  | {
    success: true;
    user: { id: string; email?: string };
    role: UserRole;
    supabase: unknown;
    requestUrl?: string;
    requestHost?: string;
    requestProjectRef?: string;
  }
  | {
    success: false;
    error: string;
    status: 401 | 403;
  };

export type MobileApiContext = Extract<MobileApiAuthResult, { success: true }>;

export type WorkerStatusUpdate = Extract<
  JobStatus,
  | "worker_on_way"
  | "arrived"
  | "inspecting"
  | "repairing"
  | "completed_by_worker"
>;

export type WorkerStatusUpdateInput = {
  status: WorkerStatusUpdate;
  completion_notes?: string;
  completion_photo_urls?: string[];
  access_check_in?: {
    mode: "geofence" | "manual_photo";
    lat?: number;
    lng?: number;
    accuracy_m?: number;
    photo_urls?: string[];
    note?: string;
    checked_in_at?: string;
  };
};

export type WorkerRouteOrigin = {
  latitude: number;
  longitude: number;
};

export type PlacesAutocompleteResponse = {
  suggestions: Array<{
    place_id: string;
    label: string;
    main_text: string;
    secondary_text: string | null;
  }>;
  fallback_used: boolean;
};

export type KaelMemorySelfViewResponse = {
  subject_type: "customer" | "worker";
  memory: Record<string, unknown> | null;
};

export type KaelMemoryDeleteResponse = {
  subject_type: "customer" | "worker";
  deleted: true;
};

export type PendingDecisionItem = {
  kind: "scope_change";
  scope_change_id: string;
  job_id: string;
  service_type: string | null;
  problem: string | null;
  requested_description: string;
  reason: string;
  price_min: number;
  price_max: number;
  created_at: string;
};
export type PendingDecisionsResponse = {
  pending_decisions: PendingDecisionItem[];
};

export type ThreadSummary = {
  job_id: string;
  status: string;
  service_type: string | null;
  last_message: {
    content: string;
    sender_role: string | null;
    created_at: string;
  };
  unread_count: number;
};
export type ThreadsResponse = {
  threads: ThreadSummary[];
};

export type MobileApiServices = {
  getKaelCharter(): Promise<KaelPublicCharterResponse> | KaelPublicCharterResponse;
  listServices(ctx: MobileApiContext): Promise<EdgeServiceCatalogResponse>;
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
  sendKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatTurnInput,
  ): Promise<EdgeKaelChatResponse>;
  confirmKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<EdgeConfirmSearchResponse & { session_id: string }>;
  submitKaelChatEvidence(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatEvidenceInput,
  ): Promise<EdgeKaelChatResponse>;
  confirmSearch(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeConfirmSearchResponse>;
  cancelJob(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<{ job_id: string; status: JobStatus }>;
  acceptBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeAcceptBroadcastResponse>;
  declineBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeDeclineBroadcastResponse>;
  getWorkerCandidate(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeWorkerCandidateResponse>;
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
  updateJobStatus(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerStatusUpdateInput,
  ): Promise<EdgeStatusUpdateResponse>;
  authorizeApartmentAccess(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<{
    job_id: string;
    release_stage: string;
    already_authorized: boolean;
  }>;
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
  decideWorkerCancellation(
    ctx: MobileApiContext,
    cancellationId: string,
    input: WorkerCancellationDecisionInput,
  ): Promise<EdgeWorkerCancellationDecisionResponse>;
  decideScopeChange(
    ctx: MobileApiContext,
    scopeChangeId: string,
    input: CustomerScopeDecisionInput,
  ): Promise<EdgeCustomerScopeDecisionResponse>;
  confirmCompletion(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<EdgeConfirmCompletionResponse>;
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
  submitWorkerApplication(
    ctx: MobileApiContext,
    input: WorkerApplicationSubmitInput,
  ): Promise<EdgeWorkerApplicationResponse>;
  getMyKaelMemory(ctx: MobileApiContext): Promise<KaelMemorySelfViewResponse>;
  getWorkerKaelMemory(ctx: MobileApiContext): Promise<KaelMemorySelfViewResponse>;
  deleteMyKaelMemory(ctx: MobileApiContext): Promise<KaelMemoryDeleteResponse>;
  updateMyKaelMemory(
    ctx: MobileApiContext,
    input: UpdateKaelMemoryInput,
  ): Promise<KaelMemorySelfViewResponse>;
  listMyPendingDecisions(ctx: MobileApiContext): Promise<PendingDecisionsResponse>;
  listMyThreads(ctx: MobileApiContext): Promise<ThreadsResponse>;
  getCustomerProfileInsights(
    ctx: MobileApiContext,
  ): Promise<EdgeCustomerProfileInsightsResponse>;
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
  updateWorkerAvailability(
    ctx: MobileApiContext,
    input: AvailabilityToggleInput,
  ): Promise<EdgeAvailabilityToggleResponse>;
  listWorkerBroadcasts(ctx: MobileApiContext): Promise<EdgeBroadcastListResponse>;
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
};

export type MobileApiHandlerDeps = {
  authenticate(
    request: Request,
    allowedRoles?: UserRole[],
  ): Promise<MobileApiAuthResult>;
  services: MobileApiServices;
};
