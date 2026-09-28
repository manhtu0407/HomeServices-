import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isRecord } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import type { EdgeAmbassadorProgramDraftInput } from "../../../../_shared/domain.ts";
import { requireAdminCapability } from "../admin/actor.ts";
import type {
  EdgeAdminAmbassadorProgramResponse,
  EdgeAdminAmbassadorProgramVersion,
} from "../contracts/ambassador.ts";
import { malformed, parseAdminProgram } from "./parse.ts";

// The RPCs raise named exceptions; each becomes a precise 4xx so the editor can say why a
// draft was refused instead of reporting a server error.
function failFromRpc(message: string | undefined, fallback: string): never {
  const text = message ?? "";
  if (text.includes("ADMIN_CAPABILITY_REQUIRED")) {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản không có quyền quản lý chương trình thưởng", 403);
  }
  if (text.includes("AMBASSADOR_PROGRAM_SELF_APPROVAL")) {
    apiFailure("SELF_APPROVAL", "Người soạn bản nháp không thể tự phê duyệt; cần một quản trị viên khác", 409);
  }
  if (text.includes("AMBASSADOR_PROGRAM_INVALID")) {
    apiFailure("PROGRAM_INVALID", "Bản nháp vượt trần 60% hoa hồng hoặc các mốc chưa tăng dần", 422);
  }
  if (text.includes("AMBASSADOR_PROGRAM_NOT_DRAFT")) {
    apiFailure("INVALID_STATUS", "Chỉ bản nháp mới được chỉnh sửa hoặc phê duyệt", 409);
  }
  if (text.includes("INVALID_AMBASSADOR_PROGRAM_INPUT") || text.includes("violates check constraint")) {
    apiFailure("VALIDATION", "Cấu hình chương trình thưởng không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", fallback, 500);
}

export async function getAdminAmbassadorProgram(
  ctx: MobileApiContext,
): Promise<EdgeAdminAmbassadorProgramResponse> {
  await requireAdminCapability(ctx, "workers.bonus.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_get_ambassador_program", { p_actor_id: ctx.user.id }),
  );
  if (result.error) failFromRpc(result.error.message, "Chưa thể tải chương trình thưởng");
  if (!isRecord(result.data)) malformed("admin program response");
  return {
    approved: parseAdminProgram(result.data.approved),
    draft: parseAdminProgram(result.data.draft),
  };
}

export async function saveAdminAmbassadorProgramDraft(
  ctx: MobileApiContext,
  input: EdgeAmbassadorProgramDraftInput,
): Promise<EdgeAdminAmbassadorProgramVersion> {
  await requireAdminCapability(ctx, "workers.bonus.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_save_ambassador_program_draft", {
      p_actor_id: ctx.user.id,
      p_program: input,
    }),
  );
  if (result.error) failFromRpc(result.error.message, "Chưa thể lưu bản nháp chương trình thưởng");
  const program = parseAdminProgram(result.data);
  if (!program) malformed("saved draft");
  return program;
}

export async function approveAdminAmbassadorProgram(
  ctx: MobileApiContext,
  versionId: string,
): Promise<EdgeAdminAmbassadorProgramVersion> {
  await requireAdminCapability(ctx, "workers.bonus.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_approve_ambassador_program", {
      p_actor_id: ctx.user.id,
      p_version_id: versionId,
    }),
  );
  if (result.error) failFromRpc(result.error.message, "Chưa thể phê duyệt chương trình thưởng");
  const program = parseAdminProgram(result.data);
  if (!program) malformed("approved program");
  return program;
}
