import {
  customerCancellationRequestSchema,
  disputeOpenRequestSchema,
  edgeJobIncidentScopeProposalSchema,
  edgeJobIncidentScopePricePreviewSchema,
  jobCreateSchema,
  jobMatchingPreferenceSchema,
  jobMediaAttachSchema,
  jobMessageSendSchema,
  kaelWorkerClarifySchema,
  reviewSchema,
  workerCancellationRequestSchema,
  workerScopeChangeSchema,
} from "../../../../_shared/domain.ts";
import {
  jobMediaRevokeSchema,
  jobMediaUploadSchema,
} from "../../../../_shared/job-media-contract.ts";
import {
  directWorkerPaymentResponseSchema,
  directWorkerPaymentSelectSchema,
  manualBankPaymentClaimSchema,
} from "../routes/payment-contract.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import { workerStatusUpdateSchema } from "../dto/worker.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { assertNever, type JobDispatchRoute } from "./kinds.ts";

export async function dispatchJobRoute(
  route: JobDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "jobs.create": {
      const input = jobCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      apiFailure(
        "KAEL_CASE_WORK_REQUIRED",
        "Hãy bắt đầu qua Kael Case Work và xác nhận báo giá trước khi tạo yêu cầu.",
        409,
        { next_route: "/kael/chat" },
      );
    }
    case "jobs.get":
      return services.getJob(ctx, route.jobId);
    case "jobs.confirmSearch":
      return services.confirmSearch(ctx, route.jobId);
    case "jobs.matchingPreference": {
      const input = jobMatchingPreferenceSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setJobMatchingPreference(ctx, route.jobId, input.data);
    }
    case "jobs.cancel":
      return services.cancelJob(ctx, route.jobId);
    case "jobs.customerCancellation": {
      const input = customerCancellationRequestSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestCustomerCancellation(ctx, route.jobId, input.data);
    }
    case "jobs.openDispute": {
      const input = disputeOpenRequestSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.openDispute(ctx, route.jobId, input.data);
    }
    case "jobs.accept":
      return services.acceptBroadcast(ctx, route.jobId);
    case "jobs.decline":
      return services.declineBroadcast(ctx, route.jobId);
    case "jobs.workerCandidate":
      return services.getWorkerCandidate(ctx, route.jobId);
    case "jobs.workerCandidateConfirm":
      return services.confirmWorkerCandidate(ctx, route.jobId, route.candidateId);
    case "jobs.workerCandidateReject":
      return services.rejectWorkerCandidate(ctx, route.jobId, route.candidateId);
    case "jobs.status": {
      const input = workerStatusUpdateSchema(await readJson(request), route.jobId);
      return services.updateJobStatus(ctx, route.jobId, input);
    }
    case "jobs.accessAuthorize":
      return services.authorizeApartmentAccess(ctx, route.jobId);
    case "jobs.scopeChange": {
      const input = workerScopeChangeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestScopeChange(ctx, route.jobId, input.data);
    }
    case "jobs.kaelIncidentGet":
      return services.getJobIncident(ctx, route.jobId);
    case "jobs.kaelIncidentOpen": {
      const input = workerScopeChangeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
      return services.openJobIncident(ctx, route.jobId, input.data);
    }
    case "jobs.kaelIncidentProposeScope": {
      const input = edgeJobIncidentScopeProposalSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
      return services.proposeScopeChangeFromJobIncident(ctx, route.jobId, input.data);
    }
    case "jobs.kaelIncidentPreviewScope": {
      const input = edgeJobIncidentScopePricePreviewSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
      return services.previewScopeChangeFromJobIncident(ctx, route.jobId, input.data);
    }
    case "jobs.kaelClarify": {
      const input = kaelWorkerClarifySchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.askKaelForWorker(ctx, route.jobId, input.data);
    }
    case "jobs.workerCancellation": {
      const input = workerCancellationRequestSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestWorkerCancellation(ctx, route.jobId, input.data);
    }
    case "jobs.media": {
      const input = jobMediaAttachSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.attachJobMedia(ctx, route.jobId, input.data);
    }
    case "jobs.mediaUpload": {
      const input = jobMediaUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createJobMediaUpload(ctx, route.jobId, input.data);
    }
    case "jobs.mediaRevoke": {
      const input = jobMediaRevokeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.revokeJobMediaUploads(ctx, route.jobId, input.data);
    }
    case "jobs.messages.list":
      return services.listJobMessages(ctx, route.jobId);
    case "jobs.messages.send": {
      const input = jobMessageSendSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendJobMessage(ctx, route.jobId, input.data);
    }
    case "jobs.confirmCompletion":
      return services.confirmCompletion(ctx, route.jobId);
    case "jobs.paymentIntent":
      return services.createPaymentIntent(ctx, route.jobId);
    case "jobs.paymentOrder":
      return services.createManualBankPaymentOrder(ctx, route.jobId);
    case "jobs.paymentOrderClaim": {
      const input = manualBankPaymentClaimSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Xác nhận chuyển khoản không hợp lệ", 400);
      return services.claimManualBankPayment(ctx, route.jobId, input.data);
    }
    case "jobs.directPaymentSelect": {
      const input = directWorkerPaymentSelectSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu trả trực tiếp không hợp lệ", 400);
      return services.selectDirectWorkerPayment(ctx, route.jobId, input.data.client_request_id);
    }
    case "jobs.directPaymentRespond": {
      const input = directWorkerPaymentResponseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Xác nhận trả trực tiếp không hợp lệ", 400);
      return services.respondToDirectWorkerPayment(ctx, route.jobId, input.data);
    }
    case "jobs.cashPaymentConfirm":
      return services.confirmWorkerCashPayment(ctx, route.jobId);
    case "jobs.stagingPaymentConfirm":
      return services.confirmStagingPayment(ctx, route.jobId);
    case "jobs.review": {
      const body = await readJson(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      }
      const input = reviewSchema.safeParse({ ...body, job_id: route.jobId });
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitReview(ctx, route.jobId, {
        rating: input.data.rating,
        tags: input.data.tags,
        comment: input.data.comment,
      });
    }
  }
  return assertNever(route);
}
