import type { ScopeChangeKaelEstimate } from "../../../kael/index.ts";

export type PricedScopeChangeEstimate = Extract<
  ScopeChangeKaelEstimate,
  { fallback_used: false }
>;

type DirectScopeEffectName = "database" | "learning" | "push";

export type DirectScopeEffectState = {
  effectId: string;
  state: "pending" | "in_flight" | "completed";
};

export type DirectScopeEffectStates = Record<
  DirectScopeEffectName,
  DirectScopeEffectState
>;
