import {
  buildInitialApartmentAccessState,
  persistApartmentAccessProfileFromMetadata,
  sanitizeApartmentAccessProfile,
} from "../../worker/apartment-access.ts";
import { logJobEvent } from "../../../platform/audit.ts";
import { geocodeJobAddressForMatching } from "../../places/geo.ts";
import { dbQuery, type DbClient } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import type { EdgeAiSecrets } from "../../../kael/index.ts";
import {
  sanitizeForLLM,
  type JobCreateInput,
} from "../../../../../_shared/domain.ts";
import { nullableString } from "../../../platform/coercions.ts";

export type InsertJobShellResult =
  | {
    readonly kind: "created";
    readonly jobId: string;
    readonly displayCode: string | null;
  }
  | { readonly kind: "duplicate_client_request" };

export async function insertJobShell(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly request: JobCreateInput;
  readonly canonicalDistrict: string;
  readonly secrets: EdgeAiSecrets;
}): Promise<InsertJobShellResult> {
  const { client, ctx, request, canonicalDistrict, secrets } = input;
  const inserted = await dbQuery<{ display_code?: unknown; id: string }>(
    client
      .from("jobs")
      .insert({
        customer_id: ctx.user.id,
        service_type: request.service_type,
        description: sanitizeForLLM(request.description),
        problem_chips: request.problem_chips,
        photo_urls: request.photo_urls,
        address_building: request.address_building ?? null,
        address_unit: request.address_unit ?? null,
        address_floor: request.address_floor ?? null,
        address_district: canonicalDistrict,
        apartment_access_profile: sanitizeApartmentAccessProfile(
          request.apartment_access_profile,
        ),
        apartment_access_state: buildInitialApartmentAccessState(),
        scheduled_at: request.scheduled_at ?? null,
        status: "analyzing",
        client_request_id: request.client_request_id ?? null,
      })
      .select("id, display_code")
      .single(),
  );
  if (inserted.error?.code === "23505" && request.client_request_id) {
    return { kind: "duplicate_client_request" };
  }
  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu", 500);
  }

  const jobId = inserted.data.id;
  await persistApartmentAccessProfileFromMetadata(client, {
    customerId: ctx.user.id,
    jobId,
    addressLabel: request.address_building ?? null,
    district: canonicalDistrict,
    profile: sanitizeApartmentAccessProfile(request.apartment_access_profile),
  });
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: request.address_building ?? null,
    district: canonicalDistrict,
  }, secrets);
  await logJobEvent(client, jobId, "job_created", ctx, null, "analyzing");

  return {
    kind: "created",
    jobId,
    displayCode: nullableString(inserted.data.display_code),
  };
}
