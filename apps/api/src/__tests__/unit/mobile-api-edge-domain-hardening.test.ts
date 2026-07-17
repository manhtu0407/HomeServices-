import { describe, expect, it, vi } from "vitest";
import {
  disputeOpenRequestSchema,
  jobMessageSendSchema,
  kaelChatCreateSchema,
  kaelChatTurnSchema,
  reviewSchema,
  sanitizeForLLM,
  workerCancellationRequestSchema,
  workerRegisterSchema,
  workerServiceAreaUpdateSchema,
} from "../../../../../supabase/functions/_shared/domain";
import {
  validateJobEvidenceRefs,
} from "../../../../../supabase/functions/mobile-api/_shared/services/jobs/evidence-refs";
import {
  mergeLimitedRefs,
} from "../../../../../supabase/functions/mobile-api/_shared/services/_shared";
import type {
  DbClient,
  DbResult,
} from "../../../../../supabase/functions/mobile-api/_shared/services/db";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";

describe("Edge domain hardening parity", () => {
  it("keeps newly attached evidence when a bounded ref list is already full", () => {
    expect(mergeLimitedRefs(["old-1", "old-2"], ["new-1"], 2))
      .toEqual(["old-2", "new-1"]);
  });

  it("rejects blank visible text and half-specified coordinates", () => {
    expect(kaelChatCreateSchema.safeParse({
      service_type: "electrical",
      message: "   ",
    }).success).toBe(false);
    expect(kaelChatTurnSchema.safeParse({ message: "   " }).success).toBe(false);
    expect(jobMessageSendSchema.safeParse({ content: "\n\t " }).success).toBe(false);
    expect(reviewSchema.safeParse({
      job_id: JOB_ID,
      rating: 5,
      tags: ["   "],
    }).success).toBe(false);
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ["q1"],
      home_lat: 10.78,
    }).success).toBe(false);
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ["q1"],
      home_lat: null,
      home_lng: 106.7,
    }).success).toBe(false);
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ["q1"],
      home_lat: 10.78,
      home_lng: null,
    }).success).toBe(false);
  });

  it("removes invisible controls without splitting Unicode at the prompt boundary", () => {
    expect(sanitizeForLLM("safe\u0085\u00AD\u200B\u202E\u2066text")).toBe("safetext");
    expect(sanitizeForLLM(`${"A".repeat(4999)}😀`)).toBe("A".repeat(4999));
  });

  it("rejects future worker birth dates and registration coordinate halves", () => {
    const baseWorker = {
      legal_name: "Nguyen Van A",
      service_types: ["electrical"],
      years_experience: 2,
      districts: ["q1"],
      cccd_front_url: `supabase://worker-verification/${OWNER_ID}/cccd-front/front.jpg`,
      cccd_back_url: `supabase://worker-verification/${OWNER_ID}/cccd-back/back.jpg`,
      selfie_url: `supabase://worker-verification/${OWNER_ID}/selfie/selfie.jpg`,
      bank_account: "123456789",
      bank_name: "Vietcombank",
    };
    expect(workerRegisterSchema.safeParse({
      ...baseWorker,
      date_of_birth: "2999-01-01",
    }).success).toBe(false);
    expect(workerRegisterSchema.safeParse({
      ...baseWorker,
      date_of_birth: "1990-01-01",
      home_lng: 106.7,
    }).success).toBe(false);
  });

  it("accepts only exact private evidence refs for dispute and worker cancellation", () => {
    const dispute = {
      dispute_type: "damage_claim",
      initiator_statement: "Damage was visible after the completed service.",
      evidence_photo_urls: [`supabase://job-media/${JOB_ID}/after/photo.jpg`],
    };
    expect(disputeOpenRequestSchema.safeParse(dispute).success).toBe(true);
    expect(disputeOpenRequestSchema.safeParse({
      ...dispute,
      evidence_photo_urls: ["https://example.test/photo.jpg"],
    }).success).toBe(false);
    expect(disputeOpenRequestSchema.safeParse({
      ...dispute,
      evidence_photo_urls: [`supabase://job-media/${JOB_ID}/after/../secret.jpg`],
    }).success).toBe(false);
    expect(disputeOpenRequestSchema.safeParse({
      ...dispute,
      evidence_photo_urls: [`supabase://job-media/${JOB_ID}/after/nested/photo.jpg`],
    }).success).toBe(false);

    expect(workerCancellationRequestSchema.safeParse({
      reason: "The worker cannot safely continue this service.",
      evidence_photo_urls: [`supabase://job-media/${JOB_ID}/cancellation_evidence/photo.jpg`],
    }).success).toBe(true);
    expect(workerCancellationRequestSchema.safeParse({
      reason: "The worker cannot safely continue this service.",
      evidence_photo_urls: [`supabase://job-media/${JOB_ID}/before/photo.jpg`],
    }).success).toBe(false);
  });
});

describe("job evidence route ownership", () => {
  it("returns deduplicated refs only when an attached asset matches job, stage, and owner", async () => {
    const ref = `supabase://job-media/${JOB_ID}/cancellation_evidence/photo.jpg`;
    const { client, eq } = mockDb({
      data: [{
        object_path: `${JOB_ID}/cancellation_evidence/photo.jpg`,
        stage: "cancellation_evidence",
        owner_id: OWNER_ID,
      }],
      error: null,
    });

    await expect(validateJobEvidenceRefs(client, {
      jobId: JOB_ID,
      mediaRefs: [ref, ref],
      allowedStages: ["cancellation_evidence"],
      ownerId: OWNER_ID,
    })).resolves.toEqual([ref]);
    expect(eq).toHaveBeenCalledWith("job_id", JOB_ID);
    expect(eq).toHaveBeenCalledWith("owner_id", OWNER_ID);
  });

  it("rejects cross-job refs before querying and unattached refs after querying", async () => {
    const crossJob = mockDb({ data: [], error: null });
    await expect(validateJobEvidenceRefs(crossJob.client, {
      jobId: JOB_ID,
      mediaRefs: [`supabase://job-media/${OTHER_JOB_ID}/after/photo.jpg`],
      allowedStages: ["after"],
      ownerId: OWNER_ID,
    })).rejects.toMatchObject({ code: "INVALID_JOB_MEDIA_REF", status: 400 });
    expect(crossJob.from).not.toHaveBeenCalled();

    const unattached = mockDb({ data: [], error: null });
    await expect(validateJobEvidenceRefs(unattached.client, {
      jobId: JOB_ID,
      mediaRefs: [`supabase://job-media/${JOB_ID}/after/photo.jpg`],
      allowedStages: ["after"],
      ownerId: OWNER_ID,
    })).rejects.toMatchObject({ code: "INVALID_JOB_MEDIA_REF", status: 400 });
  });

  it("rejects an attached path when its stage or owner does not match", async () => {
    const ref = `supabase://job-media/${JOB_ID}/after/photo.jpg`;
    for (const row of [
      {
        object_path: `${JOB_ID}/after/photo.jpg`,
        stage: "before",
        owner_id: OWNER_ID,
      },
      {
        object_path: `${JOB_ID}/after/photo.jpg`,
        stage: "after",
        owner_id: "44444444-4444-4444-8444-444444444444",
      },
    ]) {
      const { client } = mockDb({ data: [row], error: null });
      await expect(validateJobEvidenceRefs(client, {
        jobId: JOB_ID,
        mediaRefs: [ref],
        allowedStages: ["after"],
        ownerId: OWNER_ID,
      })).rejects.toMatchObject({ code: "INVALID_JOB_MEDIA_REF", status: 400 });
    }
  });

  it("fails closed when attachment validation is unavailable", async () => {
    const { client } = mockDb({
      data: null,
      error: { code: "DB_TIMEOUT", message: "timeout" },
    });
    await expect(validateJobEvidenceRefs(client, {
      jobId: JOB_ID,
      mediaRefs: [`supabase://job-media/${JOB_ID}/after/photo.jpg`],
      allowedStages: ["after"],
      ownerId: OWNER_ID,
    })).rejects.toMatchObject({ code: "MEDIA_VALIDATION_UNAVAILABLE", status: 503 });
  });
});

function mockDb(result: DbResult<Array<Record<string, unknown>>>) {
  const select = vi.fn();
  const eq = vi.fn();
  const inFilter = vi.fn();
  const chain: Record<string, unknown> = {
    select,
    eq,
    in: inFilter,
    then: (onFulfilled?: (value: typeof result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  select.mockReturnValue(chain);
  eq.mockReturnValue(chain);
  inFilter.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  return {
    client: { from, rpc: vi.fn() } as unknown as DbClient,
    eq,
    from,
  };
}
