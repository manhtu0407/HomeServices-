import { describe, expect, it } from "vitest";
import {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/case-work/scope-risk";

describe("Edge scope-risk arithmetic bounds", () => {
  it("fails closed when finite prices overflow the drift ratio", () => {
    const result = calculateScopeChangeAnomaly({
      originalPriceMax: Number.MIN_VALUE,
      newPriceMax: Number.MAX_VALUE,
      hasPhotos: true,
      description: "Scope changed.",
      reason: "Needs review.",
      workerScopeChangeRate: 0.1,
    });

    expect(Number.isFinite(result.driftRatio)).toBe(true);
    expect(result).toMatchObject({
      driftRatio: 1,
      score: 1,
      challengeRequired: true,
      adminFlagRequired: true,
      reasons: ["invalid_scope_change_risk_input"],
    });
  });

  it.each([
    [Number.MAX_VALUE, 2, 2],
    [1_000_000_000, 1_000_000_000, 1],
  ])("fails closed when fair-price arithmetic is unsafe", (hours, hourlyRate, multiplier) => {
    const result = calculateScopeChangeMargin({
      newComplexity: "medium",
      newPriceMax: 500_000,
      config: {
        complexityHours: { small: 1, medium: hours, large: 6 },
        hcmcHourlyRateVnd: hourlyRate,
        baseMultiplier: multiplier,
      },
    });

    expect(Number.isFinite(result.fairPriceMax)).toBe(true);
    expect(result).toEqual({
      fairPriceMax: 0,
      assessment: "requires_attention",
      adminAlert: true,
    });
  });
});
