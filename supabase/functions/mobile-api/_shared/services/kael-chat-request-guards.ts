import { kaelIntakeConfirmationSchema } from "../kael/intake-confirmation.ts";
import { apiFailure } from "../router.ts";

export function withoutEphemeralKaelMediaUrls(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { photo_urls: _ephemeralSignedUrls, ...durableMetadata } = metadata;
  return durableMetadata;
}

export function assertIntakeConfirmationCompleted(metadata: Record<string, unknown>) {
  const confirmation = kaelIntakeConfirmationSchema.safeParse(
    metadata.intake_confirmation,
  );
  if (confirmation.success && confirmation.data.status === "pending") {
    apiFailure(
      "INTAKE_CONFIRMATION_REQUIRED",
      "Hãy xác nhận thông tin trước khi Kael tiếp tục.",
      409,
    );
  }
}
