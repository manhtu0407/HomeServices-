import {
  type AvailabilityToggleInput,
  availabilityToggleSchema,
  type CustomerScopeDecisionInput,
  customerScopeDecisionSchema,
  type JobCreateInput,
  jobCreateSchema,
  type ReviewInput,
  reviewSchema,
  type WorkerRegisterInput,
  workerRegisterSchema,
  type WorkerScopeChangeInput,
  workerScopeChangeSchema,
} from "../../_shared/domain.ts";
import type {
  BroadcastStatus,
  ComplexityLevel,
  JobStatus,
  ScopeChangeStatus,
  ServiceType,
  UserRole,
  WorkerVerificationStatus,
} from "../../_shared/domain.ts";

type KaelEstimate = {
  service_type: ServiceType;
  problem_category: string;
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  confidence: number;
  advisory: string | null;
  disclaimer: string;
};

type ServiceCatalogResponse = {
  services: {
    id: string;
    service_type: ServiceType;
    label_vi: string;
    problems: {
      id: string;
      slug: string;
      label_vi: string;
      default_complexity: ComplexityLevel;
    }[];
    baselines: {
      complexity: ComplexityLevel;
      district_code: string;
      price_min: number;
      price_max: number;
    }[];
  }[];
};

type CreateJobResponse = {
  job_id: string;
  status: JobStatus;
  estimate: KaelEstimate;
  fallback_used: boolean;
};
type ConfirmSearchResponse = {
  job_id: string;
  status: JobStatus;
  broadcast_sent: boolean;
  worker: null | { full_name: string; rating: number; total_jobs: number };
  message: string;
};
type StatusUpdateResponse = {
  job_id: string;
  from_status: JobStatus;
  to_status: JobStatus;
  updated_at: string;
};
type ConfirmCompletionResponse = {
  job_id: string;
  status: JobStatus;
  final_price: number | null;
};
type ReviewResponse = { review_id: string; job_id: string; status: JobStatus };
type WorkerRegisterResponse = {
  worker_id: string;
  verification_status: WorkerVerificationStatus;
  submitted_at: string;
};
type AvailabilityToggleResponse = {
  worker_id: string;
  is_available: boolean;
  updated_at: string;
};
type AcceptBroadcastResponse = {
  job_id: string;
  status: JobStatus;
  full_address: {
    building: string | null;
    unit: string | null;
    floor: string | null;
    district: string | null;
  };
};
type DeclineBroadcastResponse = { job_id: string; declined: true };
type WorkerScopeChangeResponse = {
  scope_change_id: string;
  job_id: string;
  status: ScopeChangeStatus;
  created_at: string;
};
type CustomerScopeDecisionResponse = {
  scope_change_id: string;
  job_id: string;
  status: ScopeChangeStatus;
  decided_at: string;
};
type BroadcastListResponse = {
  broadcasts: {
    broadcast_id: string;
    job_id: string;
    status: BroadcastStatus;
    service_type: ServiceType;
    problem_summary: string | null;
    district: string | null;
    estimated_price_min: number | null;
    estimated_price_max: number | null;
    estimated_earning_min: number | null;
    estimated_earning_max: number | null;
    sent_at: string | null;
    expires_at: string | null;
    seconds_remaining: number | null;
  }[];
};
type WorkerJobListResponse = {
  jobs: {
    id: string;
    status: JobStatus;
    service_type: ServiceType;
    problem_summary: string | null;
    address_building: string | null;
    address_unit: string | null;
    address_floor: string | null;
    district: string | null;
    final_price: number | null;
    estimated_earning: number | null;
    created_at: string;
    matched_at: string | null;
    completed_at: string | null;
  }[];
};
type EarningsResponse = {
  worker_id: string;
  total_jobs_paid: number;
  gross_earnings: number;
  platform_fee_total: number;
  net_earnings: number;
  pending_payment_count: number;
  pending_payment_amount: number;
  from_date: string | null;
  to_date: string | null;
};
type WorkerProfileResponse = {
  id: string;
  verification_status: WorkerVerificationStatus;
  is_available: boolean;
  is_approved: boolean;
  is_suspended: boolean;
  service_types: ServiceType[];
  districts: string[];
  years_experience: number;
  rating: number;
  total_jobs: number;
  legal_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  bank_account_masked: string | null;
  bank_name: string | null;
  has_cccd: boolean;
  has_selfie: boolean;
};
type JobDetailResponse = {
  job: {
    id: string;
    status: JobStatus;
    service_type: ServiceType;
    description: string;
    problem_chips: string[];
    photo_urls: string[];
    address_building: string | null;
    address_unit: string | null;
    address_floor: string | null;
    address_district: string | null;
    scheduled_at: string | null;
    kael_problem_identified: string | null;
    kael_complexity: ComplexityLevel | null;
    kael_price_min: number | null;
    kael_price_max: number | null;
    kael_advisory: string | null;
    final_price: number | null;
    completion_notes: string | null;
    completion_photo_urls: string[];
    created_at: string;
    matched_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    confirmed_at: string | null;
    paid_at: string | null;
    reviewed_at: string | null;
  };
  broadcast_state: {
    active_count: number;
    seconds_remaining: number | null;
  } | null;
  current_scope_change: {
    id: string;
    status: ScopeChangeStatus;
    requested_description: string | null;
    reason: string | null;
    price_min: number | null;
    price_max: number | null;
    created_at: string | null;
  } | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
const MAX_JSON_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

export type MobileApiAuthResult =
  | {
    success: true;
    user: { id: string; email?: string };
    role: UserRole;
    supabase: unknown;
  }
  | {
    success: false;
    error: string;
    status: 401 | 403;
  };

export type MobileApiContext = Extract<MobileApiAuthResult, { success: true }>;

type WorkerStatusUpdate = Extract<
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
  final_price?: number;
};

export type MobileApiServices = {
  listServices(ctx: MobileApiContext): Promise<ServiceCatalogResponse>;
  createJob(
    ctx: MobileApiContext,
    input: JobCreateInput,
  ): Promise<CreateJobResponse>;
  getJob(ctx: MobileApiContext, jobId: string): Promise<JobDetailResponse>;
  confirmSearch(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<ConfirmSearchResponse>;
  cancelJob(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<{ job_id: string; status: JobStatus }>;
  acceptBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<AcceptBroadcastResponse>;
  declineBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<DeclineBroadcastResponse>;
  updateJobStatus(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerStatusUpdateInput,
  ): Promise<StatusUpdateResponse>;
  requestScopeChange(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerScopeChangeInput,
  ): Promise<WorkerScopeChangeResponse>;
  decideScopeChange(
    ctx: MobileApiContext,
    scopeChangeId: string,
    input: CustomerScopeDecisionInput,
  ): Promise<CustomerScopeDecisionResponse>;
  confirmCompletion(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<ConfirmCompletionResponse>;
  submitReview(
    ctx: MobileApiContext,
    jobId: string,
    input: Omit<ReviewInput, "job_id">,
  ): Promise<ReviewResponse>;
  registerWorker(
    ctx: MobileApiContext,
    input: WorkerRegisterInput,
  ): Promise<WorkerRegisterResponse>;
  getWorkerProfile(ctx: MobileApiContext): Promise<WorkerProfileResponse>;
  updateWorkerAvailability(
    ctx: MobileApiContext,
    input: AvailabilityToggleInput,
  ): Promise<AvailabilityToggleResponse>;
  listWorkerBroadcasts(ctx: MobileApiContext): Promise<BroadcastListResponse>;
  listWorkerJobs(ctx: MobileApiContext): Promise<WorkerJobListResponse>;
  getWorkerEarnings(
    ctx: MobileApiContext,
    range: { from?: string; to?: string },
  ): Promise<EarningsResponse>;
};

export type MobileApiHandlerDeps = {
  authenticate(
    request: Request,
    allowedRoles?: UserRole[],
  ): Promise<MobileApiAuthResult>;
  services: MobileApiServices;
};

class ApiFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function apiFailure(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): never {
  throw new ApiFailure(code, message, status, extra);
}

export function createMobileApiHandler(deps: MobileApiHandlerDeps) {
  return async function handleMobileApi(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      const route = matchRoute(request);
      if (!route) return jsonError("NOT_FOUND", "Không tìm thấy endpoint", 404);

      const auth = await deps.authenticate(request, route.roles);
      if (!auth.success) {
        return jsonError(
          auth.status === 401 ? "AUTH_MISSING" : "AUTH_FORBIDDEN",
          auth.error,
          auth.status,
        );
      }

      const data = await dispatchRoute(route, request, auth, deps.services);
      return json(
        data,
        ("successStatus" in route ? route.successStatus : undefined) ?? 200,
      );
    } catch (err) {
      if (err instanceof ApiFailure) {
        return jsonError(err.code, err.message, err.status, err.extra);
      }

      console.error("mobile-api unhandled error", {
        code: "UNHANDLED",
        errorName: err instanceof Error ? err.name : typeof err,
      });
      return jsonError(
        "INTERNAL_ERROR",
        "Hệ thống đang bận, vui lòng thử lại",
        500,
      );
    }
  };
}

type Route =
  | { kind: "services"; method: "GET"; roles?: UserRole[] }
  | {
    kind: "jobs.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "jobs.get"; method: "GET"; jobId: string; roles?: UserRole[] }
  | {
    kind: "jobs.confirmSearch";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | { kind: "jobs.cancel"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.accept"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.decline"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.status"; method: "PATCH"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.scopeChange";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "scope.decide";
    method: "POST";
    scopeChangeId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.confirmCompletion";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.review";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "workers.register";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "workers.me"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.availability"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.broadcasts"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.jobs"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.earnings"; method: "GET"; roles: UserRole[] };

function matchRoute(request: Request): Route | null {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/services") {
    return { kind: "services", method: "GET" };
  }
  if (method === "POST" && path === "/jobs") {
    return {
      kind: "jobs.create",
      method: "POST",
      roles: ["customer"],
      successStatus: 201,
    };
  }
  if (method === "POST" && path === "/workers/register") {
    return {
      kind: "workers.register",
      method: "POST",
      roles: ["worker"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/workers/me") {
    return { kind: "workers.me", method: "GET", roles: ["worker"] };
  }
  if (method === "PATCH" && path === "/workers/me/availability") {
    return { kind: "workers.availability", method: "PATCH", roles: ["worker"] };
  }
  if (method === "GET" && path === "/workers/me/broadcasts") {
    return { kind: "workers.broadcasts", method: "GET", roles: ["worker"] };
  }
  if (method === "GET" && path === "/workers/me/jobs") {
    return { kind: "workers.jobs", method: "GET", roles: ["worker"] };
  }
  if (method === "GET" && path === "/workers/me/earnings") {
    return { kind: "workers.earnings", method: "GET", roles: ["worker"] };
  }

  const job = path.match(/^\/jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (job) {
    const jobId = safeDecodePathSegment(job[1] ?? "");
    if (!jobId) return null;
    const action = job[2];
    if (!action && method === "GET") {
      return { kind: "jobs.get", method: "GET", jobId };
    }
    if (action === "confirm-search" && method === "POST") {
      return {
        kind: "jobs.confirmSearch",
        method: "POST",
        jobId,
        roles: ["customer"],
      };
    }
    if (action === "cancel" && method === "POST") {
      return {
        kind: "jobs.cancel",
        method: "POST",
        jobId,
        roles: ["customer"],
      };
    }
    if (action === "accept" && method === "POST") {
      return { kind: "jobs.accept", method: "POST", jobId, roles: ["worker"] };
    }
    if (action === "decline" && method === "POST") {
      return { kind: "jobs.decline", method: "POST", jobId, roles: ["worker"] };
    }
    if (action === "status" && method === "PATCH") {
      return { kind: "jobs.status", method: "PATCH", jobId, roles: ["worker"] };
    }
    if (action === "scope-change" && method === "POST") {
      return {
        kind: "jobs.scopeChange",
        method: "POST",
        jobId,
        roles: ["worker"],
        successStatus: 201,
      };
    }
    if (action === "confirm-completion" && method === "POST") {
      return {
        kind: "jobs.confirmCompletion",
        method: "POST",
        jobId,
        roles: ["customer"],
      };
    }
    if (action === "review" && method === "POST") {
      return {
        kind: "jobs.review",
        method: "POST",
        jobId,
        roles: ["customer"],
        successStatus: 201,
      };
    }
  }

  const scope = path.match(/^\/scope-changes\/([^/]+)\/decide$/);
  if (scope && method === "POST") {
    const scopeChangeId = safeDecodePathSegment(scope[1] ?? "");
    if (!scopeChangeId) return null;
    return {
      kind: "scope.decide",
      method: "POST",
      scopeChangeId,
      roles: ["customer"],
    };
  }

  return null;
}

function safeDecodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

async function dispatchRoute(
  route: Route,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "services":
      return services.listServices(ctx);
    case "jobs.create": {
      const input = jobCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createJob(ctx, input.data);
    }
    case "jobs.get":
      return services.getJob(ctx, route.jobId);
    case "jobs.confirmSearch":
      return services.confirmSearch(ctx, route.jobId);
    case "jobs.cancel":
      return services.cancelJob(ctx, route.jobId);
    case "jobs.accept":
      return services.acceptBroadcast(ctx, route.jobId);
    case "jobs.decline":
      return services.declineBroadcast(ctx, route.jobId);
    case "jobs.status": {
      const input = workerStatusUpdateSchema(await readJson(request));
      return services.updateJobStatus(ctx, route.jobId, input);
    }
    case "jobs.scopeChange": {
      const input = workerScopeChangeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestScopeChange(ctx, route.jobId, input.data);
    }
    case "scope.decide": {
      const input = customerScopeDecisionSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.decideScopeChange(ctx, route.scopeChangeId, input.data);
    }
    case "jobs.confirmCompletion":
      return services.confirmCompletion(ctx, route.jobId);
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
    case "workers.register": {
      const input = workerRegisterSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.registerWorker(ctx, input.data);
    }
    case "workers.me":
      return services.getWorkerProfile(ctx);
    case "workers.availability": {
      const input = availabilityToggleSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateWorkerAvailability(ctx, input.data);
    }
    case "workers.broadcasts":
      return services.listWorkerBroadcasts(ctx);
    case "workers.jobs":
      return services.listWorkerJobs(ctx);
    case "workers.earnings": {
      const url = new URL(request.url);
      const from = parseIsoParam(url.searchParams.get("from"), "from");
      const to = parseIsoParam(url.searchParams.get("to"), "to");
      if (from && to && from > to) {
        apiFailure("VALIDATION", '"from" phải nhỏ hơn hoặc bằng "to"', 400);
      }
      return services.getWorkerEarnings(ctx, { from, to });
    }
  }
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }

  if (new TextEncoder().encode(text).length > MAX_JSON_BODY_BYTES) {
    apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
}

function workerStatusUpdateSchema(input: unknown): WorkerStatusUpdateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  const status = record.status;
  const allowed = [
    "worker_on_way",
    "arrived",
    "inspecting",
    "repairing",
    "completed_by_worker",
  ];
  if (typeof status !== "string" || !allowed.includes(status)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (
    record.final_price !== undefined && !isPositiveInteger(record.final_price)
  ) {
    apiFailure("VALIDATION", "Giá cuối cùng phải là số nguyên dương", 400);
  }
  if (
    status === "completed_by_worker" && !isPositiveInteger(record.final_price)
  ) {
    apiFailure("VALIDATION", "Cần nhập giá cuối cùng khi hoàn thành", 400);
  }

  const result: WorkerStatusUpdateInput = {
    status: status as WorkerStatusUpdate,
  };
  if (typeof record.completion_notes === "string") {
    if (record.completion_notes.length > 2000) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_notes = record.completion_notes.slice(0, 2000);
  } else if (record.completion_notes !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (Array.isArray(record.completion_photo_urls)) {
    const urls = record.completion_photo_urls;
    if (urls.length > 10 || urls.some((value) => !isHttpUrl(value))) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_photo_urls = urls;
  } else if (record.completion_photo_urls !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (typeof record.final_price === "number") {
    result.final_price = record.final_price;
  }
  return result;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseIsoParam(value: string | null, name: string): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    apiFailure(
      "VALIDATION",
      `Tham số "${name}" không phải định dạng ISO hợp lệ`,
      400,
    );
  }
  return new Date(parsed).toISOString();
}

function normalizePath(pathname: string): string {
  const withoutFunctionsPrefix = pathname.replace(
    /^\/functions\/v1\/mobile-api(?=\/|$)/,
    "",
  );
  const withoutFunctionPrefix = withoutFunctionsPrefix.replace(
    /^\/mobile-api(?=\/|$)/,
    "",
  );
  const clean = withoutFunctionPrefix || "/";
  return clean.endsWith("/") && clean.length > 1 ? clean.slice(0, -1) : clean;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function jsonError(
  code: string,
  error: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return json({ code, error, ...(extra ?? {}) }, status);
}
