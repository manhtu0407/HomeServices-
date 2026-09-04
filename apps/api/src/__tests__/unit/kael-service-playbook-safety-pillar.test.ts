import { describe, expect, it } from "vitest";

import {
  buildSafetyFirstElectricalEstimate,
  deterministicSafetyGuidance,
  scanIntakeSafetySignals,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/electrical-intake-policy";
import {
  getKaelPlaybook,
  getKaelPlaybookVersion,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/learning/playbooks/registry";
import { pillarWhy, type PillarManifest } from "../pillar-manifest";

export const PILLAR = {
  id: 'P44-kael-service-playbook-safety',
  invariant:
    'every supported non-electrical service has a registered playbook and its selected-service safety path detects grounded hazards, preserves negation, and forces inspection when the profile requires it',
  authority: [
    'governance/RULES.md #2 and #8',
    'governance/STRUCTURES.md §1.5',
    'governance/Plan.md §53',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks and kael-guardrails/electrical-intake-policy.ts',
  layer: 'unit',
  siblings: ['P30-kael-prompt-assembly', 'P43-staging-service-catalog'],
  mutation:
    'remove one service from the registry, return [] for a non-electrical scanner, or ignore a non-electrical immediate hazard in the estimate helper — the corresponding service, negation, guidance, and inspection cases turn red',
} as const satisfies PillarManifest;

const services = ["plumbing", "hvac", "handyman", "cleaning", "upholstery"] as const;

describe("Kael service playbook safety", () => {
  it("registers every service lane with a versioned segment", () => {
    for (const service of services) {
      const playbook = getKaelPlaybook(service);
      expect(playbook, pillarWhy(PILLAR, `service=${service}`)).toMatchObject({
        serviceType: service,
      });
      expect(getKaelPlaybookVersion(service), pillarWhy(PILLAR, `version=${service}`)).toMatch(
        new RegExp(`^${service}-playbook-`),
      );
      expect(playbook?.segment.length, pillarWhy(PILLAR, `segment=${service}`)).toBeGreaterThan(1000);
    }
  });

  it("scans the selected service and ignores a negated hazard", () => {
    expect(scanIntakeSafetySignals("cleaning", "Phòng tắm có mốc đen dày, cần xử lý."))
      .toEqual(expect.arrayContaining(["heavy_mold"]));
    expect(scanIntakeSafetySignals("hvac", "Dàn nóng ở ban công cao có tia lửa và mùi khét."))
      .toEqual(expect.arrayContaining(["sparking", "burning_smell", "height_access"]));
    expect(scanIntakeSafetySignals("upholstery", "Sofa nhung không có nhãn giặt, có rệp."))
      .toEqual(expect.arrayContaining(["missing_care_label", "delicate_fabric", "pest_evidence"]));
    expect(scanIntakeSafetySignals("handyman", "Khoan tường gặp dây điện âm, vị trí ở trên cao."))
      .toEqual(expect.arrayContaining(["concealed_electrical", "unsafe_height"]));
    expect(scanIntakeSafetySignals("cleaning", "Không có mốc, chỉ cần lau bụi nhẹ."))
      .not.toContain("heavy_mold");
  });

  it("uses service-safe guidance and inspection escalation for a cleaning hazard", () => {
    const guidance = deterministicSafetyGuidance(["heavy_mold"], "vi", "cleaning");
    expect(guidance, pillarWhy(PILLAR, "heavy_mold guidance")).toContain("mốc");

    const hvacGuidance = deterministicSafetyGuidance(["sparking"], "vi", "hvac");
    expect(hvacGuidance, pillarWhy(PILLAR, "HVAC sparking guidance")).toContain("thợ HVAC");
    expect(hvacGuidance).not.toContain("aptomat");

    const estimate = buildSafetyFirstElectricalEstimate({
      service_type: "cleaning",
      problem_category: "deep_cleaning",
      problem_summary: "Vệ sinh chuyên sâu",
      complexity: "large",
      price_min: 0,
      price_max: 0,
      confidence: 0.3,
      advisory: "Cần đánh giá điều kiện thực tế.",
      disclaimer: "Chưa có giá cuối cùng.",
    }, ["heavy_mold"], "vi", "cleaning");

    expect(estimate.needs_inspection, pillarWhy(PILLAR, "cleaning heavy_mold"))
      .toBe(true);
    expect(estimate.advisory).toContain("mốc");
  });
});
