import type {
  CustomerAccountDeletionRequest,
} from "../../../_shared/domain.ts";
import { apiFailure } from "../router.ts";
import type {
  EdgeCustomerAccountDeletionResponse,
  MobileApiContext,
} from "../router/contracts.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { removeCustomerAvatarObject } from "./worker-avatar.service.ts";

const FRESH_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

type AccountDeletionRow = {
  avatar_storage_ref?: unknown;
  checkpoint?: unknown;
  request_id?: unknown;
  request_status?: unknown;
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
};

export async function deleteCustomerAccount(
  ctx: MobileApiContext,
  input: CustomerAccountDeletionRequest,
): Promise<EdgeCustomerAccountDeletionResponse> {
  if (ctx.role !== "customer") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Chỉ chủ tài khoản khách hàng mới có thể xóa tài khoản này",
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

  const prepared = await dbQuery<AccountDeletionRow[]>(
    db(ctx).rpc("prepare_customer_account_deletion", {
      p_client_request_id: input.client_request_id,
      p_customer_id: ctx.user.id,
    }),
  );
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
    const avatarRemoved = await removeCustomerAvatarObject(
      ctx.supabase,
      request?.avatar_storage_ref,
      ctx.user.id,
    );
    if (!avatarRemoved) {
      apiFailure(
        "ACCOUNT_DELETION_PROCESSING",
        "Ảnh đại diện chưa thể xóa an toàn. Vui lòng thử lại.",
        503,
      );
    }

    const client = ctx.supabase as AccountDeletionClient;
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

    const completed = await dbQuery<AccountDeletionRow[]>(
      db(ctx).rpc("complete_customer_account_deletion", {
        p_client_request_id: input.client_request_id,
        p_customer_id: ctx.user.id,
      }),
    );
    if (completed.error) {
      // Authentication and personal-data removal already succeeded. Do not
      // tell the client to retry an irreversible operation solely because the
      // internal completion marker could not be advanced.
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
      "Bạn còn khoản thanh toán đang được xử lý. Hãy chờ đối soát hoàn tất trước khi xóa tài khoản.",
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
