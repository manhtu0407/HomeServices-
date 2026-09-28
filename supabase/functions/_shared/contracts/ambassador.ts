import { z } from "zod";

export const ambassadorRedeemSchema = z.object({
  milestone_id: z.uuid(),
  client_request_id: z.uuidv4(),
}).strict();

export const referralClaimSchema = z.object({
  code: z.string().trim().min(4).max(32),
}).strict();

const ambassadorMilestoneDraftSchema = z.object({
  rank: z.number().int().min(1).max(20),
  title_vi: z.string().trim().min(2).max(40),
  title_en: z.string().trim().min(2).max(40),
  points_required: z.number().int().min(1).max(1_000_000),
  reward_vnd: z.number().int().min(1_000).max(100_000_000),
}).strict();

const ambassadorMultiplierDraftSchema = z.object({
  min_active_customers: z.number().int().min(1).max(1_000),
  multiplier_bps: z.number().int().min(10_001).max(12_000),
}).strict();

export const ambassadorProgramDraftSchema = z.object({
  commission_vnd_per_point: z.number().int().min(1_000).max(1_000_000),
  customer_vnd_per_point: z.number().int().min(1_000).max(1_000_000),
  link_months: z.number().int().min(1).max(36),
  network_window_days: z.number().int().min(7).max(365),
  rebook_min_jobs: z.number().int().min(2).max(10),
  invite_claim_days: z.number().int().min(1).max(30),
  milestones: z.array(ambassadorMilestoneDraftSchema).min(1).max(20),
  multipliers: z.array(ambassadorMultiplierDraftSchema).max(10),
}).strict();

export type EdgeAmbassadorRedeemInput = z.infer<typeof ambassadorRedeemSchema>;
export type EdgeReferralClaimInput = z.infer<typeof referralClaimSchema>;
export type EdgeAmbassadorProgramDraftInput = z.infer<typeof ambassadorProgramDraftSchema>;
