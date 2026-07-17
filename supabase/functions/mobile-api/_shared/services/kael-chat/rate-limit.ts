import { apiFailure } from "../../router.ts";

export function rejectKaelChatRateLimit(reason: string | null): never {
  apiFailure(
    "RATE_LIMITED",
    reason === "hour"
      ? "Bạn đã đạt giới hạn 20 phiên Kael trong 1 giờ. Vui lòng thử lại sau."
      : "Bạn đang gửi quá nhanh. Vui lòng thử lại sau ít phút.",
    429,
  );
}
