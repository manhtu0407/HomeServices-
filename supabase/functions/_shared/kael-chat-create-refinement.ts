import { z } from "zod";
import { getKaelPerformanceProfile } from "../mobile-api/_shared/kael/performance-profiles.ts";

type KaelChatCreateRefinementInput = {
  service_type: string;
  profile_id?: string;
  intake_source?: "booking" | "direct_chat";
  intake_description?: string;
  message?: string;
  problem_chips: readonly string[];
  address_label?: string;
  address_district?: string;
  scheduled_at?: string;
  schedule_window?: unknown;
};

export function refineKaelChatCreateInput(
  value: KaelChatCreateRefinementInput,
  ctx: z.RefinementCtx,
) {
  if (
    value.profile_id &&
    getKaelPerformanceProfile(value.service_type)?.id !== value.profile_id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "profile_id must match service_type",
      path: ["profile_id"],
    });
  }
  if (value.intake_source !== "booking") return;

  const requiredBookingFields: ReadonlyArray<readonly [string, unknown]> = [
    ["profile_id", value.profile_id],
    ["intake_description", value.intake_description],
    ["message", value.message],
    ["address_label", value.address_label],
    ["address_district", value.address_district],
    ["scheduled_at", value.scheduled_at],
    ["schedule_window", value.schedule_window],
  ];
  for (const [field, fieldValue] of requiredBookingFields) {
    if (fieldValue) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field} is required for booking intake`,
      path: [field],
    });
  }
  if (value.problem_chips.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "problem_chips are required for booking intake",
      path: ["problem_chips"],
    });
  }
}
