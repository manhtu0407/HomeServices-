import { describe, expect, it, vi } from "vitest";
import {
  getKaelPlaybook,
  getKaelPlaybookVersion,
  isKaelPlaybookEnabled,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/learning/playbooks/registry";
import {
  buildIntakeDiagnosisMessages,
  kaelIntakeDiagnosisPromptVersion,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/prompts/prompts";
import {
  buildIntakeObservation,
  resolveElectricalIntakeRuntime,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-runtime";
import {
  deterministicSafetyGuidance,
  scanIntakeSafetySignals,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/electrical-intake-policy";
import { pillarWhy, type PillarManifest } from "../pillar-manifest";

export const PILLAR = {
  id: 'P46-kael-playbook-registry',
  invariant: 'only the selected enabled service playbook is injected and its version/safety path remains isolated from other services',
  authority: ['governance/RULES.md #2 and #8', 'governance/Plan.md §53'],
  target: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/registry.ts and kael-guardrails/electrical-intake-policy.ts',
  layer: 'unit',
  siblings: ['P30-kael-prompt-assembly', 'P44-kael-service-playbook-safety', 'P43-staging-service-catalog'],
  mutation: 'inject the wrong selected-service segment, lose the plumbing version stamp, or cross-apply a cleaning safety scanner — an isolation assertion turns red',
} as const satisfies PillarManifest;

const services = ["electrical", "plumbing", "hvac", "handyman", "cleaning", "upholstery"] as const;

describe("Kael playbook registry", () => {
  it("reads each service flag independently and keeps unknown services off", () => {
    const values: Record<string, string> = {
      KAEL_PLAYBOOK_ELECTRICAL_ENABLED: "true",
      KAEL_PLAYBOOK_PLUMBING_ENABLED: "false",
      KAEL_PLAYBOOK_CLEANING_ENABLED: "yes",
    };
    vi.stubGlobal("Deno", {
      env: { get: (key: string) => values[key] },
    });

    try {
      expect(isKaelPlaybookEnabled("electrical")).toBe(true);
      expect(isKaelPlaybookEnabled("plumbing")).toBe(false);
      expect(isKaelPlaybookEnabled("cleaning")).toBe(true);
      expect(isKaelPlaybookEnabled("__proto__")).toBe(false);
      expect(isKaelPlaybookEnabled("electrical ")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("exposes only registered segments and preserves the electrical artifact", () => {
    const playbook = getKaelPlaybook("electrical");

    expect(playbook).not.toBeNull();
    expect(playbook?.serviceType).toBe("electrical");
    expect(playbook?.version).toBe("electrical-playbook-2026-07-16.v2");
    expect(playbook?.segment.length).toBeGreaterThan(1000);
    expect(getKaelPlaybookVersion("electrical")).toBe(
      "electrical-playbook-2026-07-16.v2",
    );
    expect(getKaelPlaybook("plumbing")).toMatchObject({
      serviceType: "plumbing",
      version: "plumbing-playbook-2026-08-27.v1",
    });
    expect(getKaelPlaybookVersion("plumbing")).toBe(
      "plumbing-playbook-2026-08-27.v1",
    );
    expect(getKaelPlaybook("plumbing")?.segment.length).toBeGreaterThan(1000);
    for (const service of services) {
      const selected = getKaelPlaybook(service);
      expect(selected, pillarWhy(PILLAR, `service=${service}`)).toMatchObject({
        serviceType: service,
      });
      expect(selected?.segment.length, pillarWhy(PILLAR, `segment=${service}`)).toBeGreaterThan(1000);
    }
    expect(getKaelPlaybook("__proto__")).toBeNull();
  });

  it("injects only the selected enabled segment and stamps its version", () => {
    vi.stubGlobal("Deno", {
      env: {
        get: (key: string) => ({
          KAEL_PLAYBOOK_ELECTRICAL_ENABLED: "false",
          KAEL_PLAYBOOK_PLUMBING_ENABLED: "on",
          KAEL_INTAKE_EVAL_OBSERVATION_ENABLED: "false",
        }[key]),
      },
    });

    try {
      const [plumbingSystem] = buildIntakeDiagnosisMessages(
        "plumbing",
        [],
        "Ống dưới lavabo đang rò nước",
      );
      const [electricalSystem] = buildIntakeDiagnosisMessages(
        "electrical",
        [],
        "Aptomat cứ bật lên là nhảy",
      );
      const plumbingObservation = buildIntakeObservation({
        scopeSignal: "in_scope",
        suggestedService: null,
        problemSlug: "pipe_leak",
        needsClarification: false,
        safetySignals: ["concealed_pipe"],
        modelId: "pillar-test",
        serviceType: "plumbing",
        electricalPlaybookEnabled: false,
      });

      expect(plumbingSystem.content).toContain("PLUMBING DIAGNOSIS PLAYBOOK");
      expect(plumbingSystem.content).not.toContain("ELECTRICAL DIAGNOSIS PLAYBOOK");
      expect(electricalSystem.content).not.toContain("ELECTRICAL DIAGNOSIS PLAYBOOK");
      expect(kaelIntakeDiagnosisPromptVersion("plumbing")).toBe("2026-08-15.v3");
      expect(plumbingObservation?.playbookVersion).toBe(
        "plumbing-playbook-2026-08-27.v1",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps plumbing safety signals on the selected playbook path", () => {
    const description = "Bồn cầu trào nước thải ra sàn nhà tắm";
    const signals = scanIntakeSafetySignals("plumbing", description);
    expect(signals).toEqual(expect.arrayContaining(["sewage", "flooding"]));
    expect(scanIntakeSafetySignals("cleaning", description)).toEqual([]);
    expect(deterministicSafetyGuidance(["sewage"], "vi")).toContain("nước thải");

    vi.stubGlobal("Deno", {
      env: {
        get: (key: string) => key === "KAEL_PLAYBOOK_PLUMBING_ENABLED" ? "true" : undefined,
      },
    });
    try {
      const runtime = resolveElectricalIntakeRuntime({
        intakeDiagnosisEnabled: true,
        serviceType: "plumbing",
        problemChips: [],
        description,
      });
      expect(runtime.enabled).toBe(true);
      expect(runtime.hardRoute).toBeNull();
      expect(runtime.safetySignals).toEqual(expect.arrayContaining(["sewage", "flooding"]));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
