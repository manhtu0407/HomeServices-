import { apiFailure } from "../../platform/api-failure.ts";

// The first approval is refused by the database until the CCCD number is on record and not
// blocklisted; the reviewer needs to see which of the two stopped it.
export function failIdentityGate(message: string | undefined): void {
  if (message?.includes("IDENTITY_NUMBER_REQUIRED")) {
    apiFailure("IDENTITY_NUMBER_REQUIRED", "Cần nhập số CCCD của thợ trước khi duyệt", 409);
  }
  if (message?.includes("IDENTITY_BLOCKLISTED")) {
    apiFailure("IDENTITY_BLOCKLISTED", "Số CCCD này đã bị chặn do vi phạm nghiêm trọng", 409);
  }
}
