import type { KaelChatCreateInput } from "../../../_shared/domain.ts";
import { normalizeServiceAreaDistrict } from "../../../_shared/domain.ts";
import { buildKaelIntakeConfirmation } from "../kael/intake-confirmation.ts";

export function resolveKaelChatAddressDistrict(
  ...candidates: ReadonlyArray<string | null | undefined>
) {
  for (const candidate of candidates) {
    const direct = normalizeServiceAreaDistrict(candidate);
    if (direct) return direct;

    const inlineDistrict = candidate?.match(
      /(?:^|[^\p{L}\p{N}])((?:quận|quan|q|district|dist)[\s.]*(?:1[0-2]|[1-9])|bình\s*thạnh|binh\s*thanh|thủ\s*đức|thu\s*duc)(?![\p{L}\p{N}])/iu,
    )?.[1];
    const extractedInlineDistrict = normalizeServiceAreaDistrict(inlineDistrict);
    if (extractedInlineDistrict) return extractedInlineDistrict;

    for (const segment of candidate?.split(/[,;\u2013\u2014\u00b7|/]/) ?? []) {
      const extracted = normalizeServiceAreaDistrict(segment);
      if (extracted) return extracted;
    }
  }
  return null;
}

export function buildBookingIntakeConfirmation(input: {
  intake: KaelChatCreateInput;
  description: string;
  problemChips: readonly string[];
  addressDistrict: string | null;
  language: "vi" | "en";
}) {
  if (input.intake.intake_source !== "booking") return null;
  return buildKaelIntakeConfirmation({
    serviceType: input.intake.service_type,
    profileId: input.intake.profile_id!,
    description: input.description,
    problemChips: input.problemChips,
    addressLabel: input.intake.address_label ?? "",
    addressDistrict: input.addressDistrict ?? "",
    scheduledAt: input.intake.scheduled_at!,
    scheduleWindow: input.intake.schedule_window!,
    language: input.language,
  });
}
