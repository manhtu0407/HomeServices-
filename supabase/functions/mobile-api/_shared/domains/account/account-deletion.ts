import type { AccountDeletionRequest } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, workflowDb, type DbClient } from "../../platform/db.ts";
import type { EdgeAccountDeletionResponse } from "../contracts/account.ts";
import { removeCustomerAvatarObject } from "../worker/avatar.ts";

const FRESH_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

type AccountDeletionRow = {
  avatar_storage_ref?: unknown;
  checkpoint?: unknown;
  request_id?: unknown;
  request_status?: unknown;
  storage_refs?: unknown;
};

type AuthAdminError = {
  code?: string;
  status?: number;
};

type AccountDeletionClient = DbClient & {
  auth: {
    admin: {
      deleteUser(
        userId: string,
        shouldSoftDelete: boolean,
      ): Promise<{ error: AuthAdminError | null }>;
    };
  };
  storage?: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ data?: unknown; error: unknown }>;
    };
  };
};

type OwnedStorageObject = {
  bucket: "job-media" | "kael-chat-media" | "worker-avatars" | "worker-verification";
  path: string;
};

// Deletion is service-owned: prepare and complete are service_role-only functions that re-check
// auth.role(), auth.admin.deleteUser needs the service key, and the private buckets have no owner
// policy. The actor is authorized in deleteAccount (role, fresh sign-in) and every id below is ctx.user.id.
export async function deleteAccount(
  ctx: MobileApiContext,
  input: AccountDeletionRequest,
): Promise<EdgeAccountDeletionResponse> {
  const actorRole = ctx.role;
  if (actorRole !== "customer" && actorRole !== "worker") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Chỉ chủ tài khoản khách hàng hoặc thợ mới có thể xóa tài khoản này",
      403,
    );
  }
  if (!hasFreshSignIn(ctx.user.lastSignInAt)) {
    apiFailure(
      "REAUTH_REQUIRED",
      "Để bảo vệ tài khoản, hãy đăng nhập lại rồi thực hiện xóa trong vòng 15 phút",
      401,
    );
  }

  const prepared = await prepareAccountDeletion(ctx, input, actorRole);
  if (prepared.error) {
    mapPreparationError(prepared.error.message);
  }

  const request = prepared.data?.[0];
  const requestId = typeof request?.request_id === "string"
    ? request.request_id
    : null;
  if (!requestId) {
    apiFailure("DB_ERROR", "Chưa thể bắt đầu xóa tài khoản", 500);
  }

  if (request?.request_status !== "completed") {
    const storageRemoved = actorRole === "customer"
      ? await removeCustomerOwnedStorageObjects(ctx, request)
      : await removeWorkerOwnedStorageObjects(
        workflowDb(ctx),
        request?.storage_refs,
        ctx.user.id,
      );
    if (!storageRemoved) {
      apiFailure(
        "ACCOUNT_DELETION_PROCESSING",
        "Dữ liệu riêng tư chưa thể xóa an toàn. Vui lòng thử lại.",
        503,
      );
    }

    const client = workflowDb(ctx) as AccountDeletionClient;
    const { error: deletionError } = await client.auth.admin.deleteUser(
      ctx.user.id,
      true,
    );
    if (deletionError && !isAlreadyDeletedError(deletionError)) {
      apiFailure(
        "ACCOUNT_DELETION_PROCESSING",
        "Yêu cầu xóa đã được khóa an toàn nhưng chưa thể hoàn tất. Vui lòng thử lại.",
        503,
      );
    }

    const completed = await completeAccountDeletion(ctx, input, actorRole);
    if (completed.error) {
      return {
        account_deleted: true,
        request_id: requestId,
        retained_transaction_records: true,
      };
    }
  }

  return {
    account_deleted: true,
    request_id: requestId,
    retained_transaction_records: true,
  };
}

function prepareAccountDeletion(
  ctx: MobileApiContext,
  input: AccountDeletionRequest,
  actorRole: "customer" | "worker",
) {
  return actorRole === "customer"
    ? dbQuery<AccountDeletionRow[]>(
      workflowDb(ctx).rpc("prepare_customer_account_deletion_v2", {
        p_client_request_id: input.client_request_id,
        p_customer_id: ctx.user.id,
      }),
    )
    : dbQuery<AccountDeletionRow[]>(
      workflowDb(ctx).rpc("prepare_worker_account_deletion", {
        p_client_request_id: input.client_request_id,
        p_worker_id: ctx.user.id,
      }),
    );
}

function completeAccountDeletion(
  ctx: MobileApiContext,
  input: AccountDeletionRequest,
  actorRole: "customer" | "worker",
) {
  return actorRole === "customer"
    ? dbQuery<AccountDeletionRow[]>(
      workflowDb(ctx).rpc("complete_customer_account_deletion", {
        p_client_request_id: input.client_request_id,
        p_customer_id: ctx.user.id,
      }),
    )
    : dbQuery<AccountDeletionRow[]>(
      workflowDb(ctx).rpc("complete_worker_account_deletion", {
        p_client_request_id: input.client_request_id,
        p_worker_id: ctx.user.id,
      }),
    );
}

async function removeWorkerOwnedStorageObjects(
  storageClient: unknown,
  rawRefs: unknown,
  workerId: string,
) {
  return removeOwnedStorageObjects(
    storageClient,
    rawRefs,
    (value) => workerOwnedStorageObject(value, workerId),
  );
}

async function removeCustomerOwnedStorageObjects(
  ctx: MobileApiContext,
  request: AccountDeletionRow | undefined,
) {
  const avatarRemoved = await removeCustomerAvatarObject(
    workflowDb(ctx),
    request?.avatar_storage_ref,
    ctx.user.id,
  );
  if (!avatarRemoved) return false;
  return removeOwnedStorageObjects(
    workflowDb(ctx),
    request?.storage_refs,
    (value) => customerOwnedStorageObject(value, ctx.user.id),
  );
}

async function removeOwnedStorageObjects(
  storageClient: unknown,
  rawRefs: unknown,
  parse: (value: unknown) => OwnedStorageObject | null,
) {
  if (rawRefs === undefined || rawRefs === null) return true;
  if (!Array.isArray(rawRefs)) return false;

  const objects = rawRefs.map(parse);
  if (objects.some((value) => value === null)) return false;

  const storage = (storageClient as AccountDeletionClient).storage;
  if (!storage) return objects.length === 0;
  const pathsByBucket = new Map<OwnedStorageObject["bucket"], Set<string>>();
  for (const object of objects as OwnedStorageObject[]) {
    const paths = pathsByBucket.get(object.bucket) ?? new Set<string>();
    paths.add(object.path);
    pathsByBucket.set(object.bucket, paths);
  }

  for (const [bucket, paths] of pathsByBucket) {
    const removed = await storage.from(bucket).remove([...paths]);
    if (removed.error) return false;
  }
  return true;
}

function customerOwnedStorageObject(
  value: unknown,
  customerId: string,
): OwnedStorageObject | null {
  if (typeof value !== "string") return null;
  const escapedCustomerId = customerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kaelMedia = value.match(new RegExp(
    `^supabase://kael-chat-media/(${escapedCustomerId}/kael-chat/(?:model_vision|private_video_original)/(?!.*(?:\\.\\.|//))[^\\s?#]+)$`,
    "i",
  ));
  if (kaelMedia) return { bucket: "kael-chat-media", path: kaelMedia[1] };
  return jobMediaStorageObject(value);
}

function workerOwnedStorageObject(
  value: unknown,
  workerId: string,
): OwnedStorageObject | null {
  if (typeof value !== "string") return null;
  const escapedWorkerId = workerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const workerAvatar = value.match(new RegExp(
    `^supabase://worker-avatars/(${escapedWorkerId}/[A-Za-z0-9._-]+)$`,
    "i",
  ));
  if (workerAvatar) return { bucket: "worker-avatars", path: workerAvatar[1] };

  const verification = value.match(new RegExp(
    `^supabase://worker-verification/(${escapedWorkerId}/(?:cccd-front|cccd-back|selfie)/[A-Za-z0-9][A-Za-z0-9._-]{0,179})$`,
    "i",
  ));
  if (verification) {
    return { bucket: "worker-verification", path: verification[1] };
  }

  const kaelMedia = value.match(new RegExp(
    `^supabase://kael-chat-media/(${escapedWorkerId}/kael-chat/(?:model_vision|private_video_original)/(?!.*(?:\\.\\.|//))[^\\s?#]+)$`,
    "i",
  ));
  if (kaelMedia) return { bucket: "kael-chat-media", path: kaelMedia[1] };
  return jobMediaStorageObject(value);
}

function jobMediaStorageObject(value: string): OwnedStorageObject | null {
  const jobMedia = value.match(
    /^supabase:\/\/job-media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence|access_check_in)\/(?!.*(?:\.\.|\/\/))[^\s?#/]+)$/i,
  );
  return jobMedia ? { bucket: "job-media", path: jobMedia[1] } : null;
}

function hasFreshSignIn(value: string | undefined) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) &&
    timestamp <= Date.now() &&
    Date.now() - timestamp <= FRESH_SIGN_IN_WINDOW_MS;
}

function isAlreadyDeletedError(error: AuthAdminError) {
  return error.status === 404 ||
    error.code === "user_not_found" ||
    error.code === "not_found";
}

function mapPreparationError(message: string | undefined): never {
  if (message?.includes("ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB")) {
    apiFailure(
      "ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB",
      "Bạn còn công việc chưa kết thúc. Hãy hoàn tất hoặc hủy công việc trước khi xóa tài khoản.",
      409,
    );
  }
  if (message?.includes("ACCOUNT_DELETION_BLOCKED_DISPUTE")) {
    apiFailure(
      "ACCOUNT_DELETION_BLOCKED_DISPUTE",
      "Bạn còn yêu cầu giải quyết chưa kết thúc. Tài khoản chỉ có thể xóa sau khi việc này hoàn tất.",
      409,
    );
  }
  if (message?.includes("ACCOUNT_DELETION_BLOCKED_PAYMENT")) {
    apiFailure(
      "ACCOUNT_DELETION_BLOCKED_PAYMENT",
      "Bạn còn khoản thanh toán đang được xử lý. Hãy chờ thanh toán hoàn tất trước khi xóa tài khoản.",
      409,
    );
  }
  if (message?.includes("ACCOUNT_DELETION_BLOCKED_SETTLEMENT")) {
    apiFailure(
      "ACCOUNT_DELETION_BLOCKED_SETTLEMENT",
      "Bạn còn khoản đối soát hoặc rút tiền đang được xử lý. Hãy chờ hoàn tất trước khi xóa tài khoản.",
      409,
    );
  }
  if (message?.includes("ACCOUNT_DELETION_ALREADY_PROCESSING")) {
    apiFailure(
      "ACCOUNT_DELETION_ALREADY_PROCESSING",
      "Một yêu cầu xóa tài khoản đang được xử lý. Vui lòng thử lại sau.",
      409,
    );
  }
  if (
    message?.includes("ACCOUNT_DELETION_NOT_FOUND") ||
    message?.includes("ACCOUNT_ALREADY_DELETED")
  ) {
    apiFailure("ACCOUNT_NOT_FOUND", "Tài khoản không còn khả dụng", 404);
  }
  apiFailure("DB_ERROR", "Chưa thể bắt đầu xóa tài khoản", 500);
}
