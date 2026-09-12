import { apiFailure } from "./api-failure.ts";

const KAEL_SCOPE_PRICE_ERRORS = new Set([
  "KAEL_PRICE_MISSING",
  "KAEL_REVIEW_MISSING",
]);

export function throwMatchingCapacityError(error: { code?: string; message?: string } | null): void {
  if (error?.code === "55000" && (
    error.message === "MATCHING_CAPACITY_UNAVAILABLE" ||
    error.message === "MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE"
  )) {
    apiFailure(error.message, "Khả năng nhận việc đã thay đổi. Hãy tải lại trạng thái ghép thợ.", 409);
  }
}

export function mapConfirmKaelChatError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure(
      "INVALID_STATUS",
      "Phiên Kael chưa ở trạng thái có thể xác nhận",
      409,
    );
  }
  if (errorCode === "ALREADY_CONFIRMED") {
    apiFailure("ALREADY_CONFIRMED", "Phiên Kael đã được xác nhận", 409);
  }
  if (errorCode === "MISSING_ESTIMATE") {
    apiFailure("MISSING_ESTIMATE", "Kael chưa có ước tính để đặt thợ", 409);
  }
  if (errorCode === "MISSING_REASONING_RECEIPT") {
    apiFailure(
      "MISSING_REASONING_RECEIPT",
      "Kael chưa có biên nhận phân tích giá đã xác thực để xác nhận báo giá",
      409,
    );
  }
  if (errorCode === "MISSING_SCOPE") {
    apiFailure(
      "MISSING_SCOPE",
      "Kael chưa hoàn tất phân tích phạm vi để xác nhận báo giá",
      409,
    );
  }
  if (errorCode === "NO_DISTRICT") {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
}

export function mapAcceptError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (errorCode === "BROADCAST_NOT_ACTIVE") {
    apiFailure(
      "BROADCAST_NOT_ACTIVE",
      "Yêu cầu này đã được xử lý hoặc đã hết hạn",
      409,
    );
  }
  if (errorCode === "EXPIRED") {
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }
  if (errorCode === "ALREADY_TAKEN") {
    apiFailure("ALREADY_TAKEN", "Yêu cầu đã được thợ khác nhận trước", 409);
  }
  if (errorCode === "WORKER_NOT_ELIGIBLE") {
    apiFailure(
      "WORKER_NOT_ELIGIBLE",
      "Tài khoản thợ chưa đủ điều kiện nhận việc",
      403,
    );
  }
  if (
    errorCode === "PRICE_QUOTE_REQUIRED" ||
    errorCode === "PRICE_QUOTE_CHANGED" ||
    errorCode === "PRICE_QUOTE_INVALID"
  ) {
    apiFailure(
      "PRICE_CONFIRMATION_REQUIRED",
      "Báo giá đã thay đổi hoặc không còn hợp lệ. Vui lòng tải lại trước khi nhận việc.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
}

export function mapAvailabilityError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Vui lòng hoàn tất đăng ký trước", 404);
  }
  if (errorCode === "NOT_APPROVED") {
    apiFailure("NOT_APPROVED", "Hồ sơ thợ chưa sẵn sàng nhận việc", 403);
  }
  if (errorCode === "WORKER_BUSY") {
    apiFailure(
      "WORKER_BUSY",
      "Bạn đang có công việc chưa kết thúc nên chưa thể bật nhận việc",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
}

export function mapCancelError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chỉ có thể hủy trước khi thợ nhận việc", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
}

export function mapWorkerCancellationRequestError(
  errorCode: string | null,
): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc phù hợp", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure(
      "INVALID_STATUS",
      "Trạng thái công việc chưa thể yêu cầu hủy",
      409,
    );
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure(
      "ALREADY_REQUESTED",
      "Yêu cầu hủy đang chờ Kael/Admin duyệt",
      409,
    );
  }
  if (errorCode === "RATE_LIMITED") {
    apiFailure("RATE_LIMITED", "Thợ đã hủy quá nhiều lần trong 24 giờ", 429);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Công việc đã thay đổi, vui lòng tải lại",
      409,
    );
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần lý do hủy rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
}

export function mapCustomerCancellationError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure(
      "INVALID_STATUS",
      "Trạng thái yêu cầu chưa thể hủy theo Case 4",
      409,
    );
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure("ALREADY_REQUESTED", "Yêu cầu hủy đang được xử lý", 409);
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần chọn lý do hủy hợp lệ", 400);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi, vui lòng tải lại",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
}

export function mapDisputeOpenError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền mở tranh chấp này", 403);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure(
      "INVALID_STATUS",
      "Trạng thái công việc chưa thể mở tranh chấp",
      409,
    );
  }
  if (errorCode === "ALREADY_OPEN") {
    apiFailure("ALREADY_OPEN", "Tranh chấp đang được xử lý", 409);
  }
  if (errorCode === "DEFERRED_PHASE0") {
    apiFailure(
      "DEFERRED_PHASE0",
      "Thanh toán đang được hoãn trong Phase 0",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
}

export function mapDisputeCounterError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tranh chấp", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền phản hồi tranh chấp này",
      403,
    );
  }
  if (errorCode === "ALREADY_SUBMITTED") {
    apiFailure("ALREADY_SUBMITTED", "Phản hồi đã được ghi nhận", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Tranh chấp không còn nhận phản hồi", 409);
  }
  apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
}

export function mapDisputeDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tranh chấp", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Chỉ admin mới được quyết định tranh chấp",
      403,
    );
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Tranh chấp đã có quyết định", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái tranh chấp không hợp lệ", 409);
  }
  apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
}

export function mapScopeRequestError(errorCode: string | null): never {
  if (KAEL_SCOPE_PRICE_ERRORS.has(errorCode ?? "")) {
    apiFailure(
      "KAEL_PRICE_MISSING",
      "Kael chưa tính được giá phát sinh hợp lệ",
      409,
    );
  }
  if (errorCode === "STATUS_CHANGED" || errorCode === "INCIDENT_CLAIM_STALE") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền thực hiện hành động này",
      403,
    );
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_PRICE_RANGE") {
    apiFailure("VALIDATION", "Khoảng giá không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
}

export function mapScopeDecisionError(errorCode: string | null): never {
  if (errorCode === "KAEL_PRICE_MISSING") {
    apiFailure(
      "KAEL_PRICE_MISSING",
      "Kael chưa chốt giá phát sinh nên chưa thể duyệt",
      409,
    );
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu thay đổi", 404);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu này đã được xử lý", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
}

export function mapReviewError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "ALREADY_REVIEWED") {
    apiFailure("ALREADY_REVIEWED", "Yêu cầu này đã được đánh giá", 409);
  }
  if (errorCode === "INVALID_RATING") {
    apiFailure("VALIDATION", "Đánh giá phải từ 1 đến 5 sao", 400);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chưa thể đánh giá yêu cầu này", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
}
