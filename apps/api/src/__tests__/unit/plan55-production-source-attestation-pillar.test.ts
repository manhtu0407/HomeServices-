import { describe, expect, it } from "vitest";
import {
  assertPlan55SourceAttestation,
  PLAN55_EVALUATOR_PATHS,
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
} from "../../../../../apps/api/scripts/lib/kael-playbook-production-attestation.mjs";
import { pillarWhy, type PillarManifest } from "../pillar-manifest";

export const PILLAR = {
  id: 'P215-plan55-actor-canary-source-attestation',
  invariant:
    'a Production-only canary is refused unless every runtime guard and caller plus all evaluation assets and evaluator files match the active release identity',
  authority: ['governance/Plan.md §55 Production-only canary exception'],
  target: 'apps/api/scripts/lib/kael-playbook-production-attestation.mjs and kael-playbook-production-attest.mjs',
  layer: 'security-negative',
  siblings: ['P46-kael-playbook-registry'],
  mutation:
    'remove an actor-guard call path from the source inventory, allow an unshipped runtime file, or omit a holdout/evaluator input; the refusal assertion turns red',
} as const satisfies PillarManifest;

const sourceSha = "645c907e178f21ddde24a72501e6c8449d6720f9";
const digest = `sha256:${"a".repeat(64)}`;

function attestFile(path: string) {
  return {
    path,
    git_blob_sha1: "b".repeat(40),
    deployed_sha256: digest,
    working_tree_sha256: digest,
    working_tree_matches_release_after_git_clean_filter: true,
  };
}

function createAttestation() {
  const services = Object.fromEntries(Object.entries(PLAN55_SOURCE_ASSETS).map(([service, assets]) => [
    service,
    Object.fromEntries(Object.entries(assets).map(([kind, path]) => [kind, attestFile(path)])),
  ]));

  return {
    schema: "plan55-production-source-attestation/v1",
    endpoint: "https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api/harness/health",
    deployment: {
      project_ref: "iwevizmsedyqozxlawwl",
      git_sha: sourceSha,
    },
    runtime_files: PLAN55_RUNTIME_SOURCE_PATHS.map(attestFile),
    evaluator: {
      files: PLAN55_EVALUATOR_PATHS,
      sha256: digest,
    },
    services,
  };
}

describe("Plan 55 Production source attestation", () => {
  it("covers the deployed canary guard, call paths, both 24-case datasets, and evaluator", () => {
    const expectedAssets = {
      hvac: {
        corpus: "docs/playbooks/eval/hvac-cases.json",
        holdout: "docs/playbooks/eval/hvac-synthetic-holdout-2026-08-27.json",
        playbook: "supabase/functions/mobile-api/_shared/kael/learning/playbooks/hvac.ts",
      },
      handyman: {
        corpus: "docs/playbooks/eval/handyman-cases.json",
        holdout: "docs/playbooks/eval/handyman-synthetic-holdout-2026-08-27.json",
        playbook: "supabase/functions/mobile-api/_shared/kael/learning/playbooks/handyman.ts",
      },
      cleaning: {
        corpus: "docs/playbooks/eval/cleaning-cases.json",
        holdout: "docs/playbooks/eval/cleaning-synthetic-holdout-2026-08-27.json",
        playbook: "supabase/functions/mobile-api/_shared/kael/learning/playbooks/cleaning.ts",
      },
      upholstery: {
        corpus: "docs/playbooks/eval/upholstery-cases.json",
        holdout: "docs/playbooks/eval/upholstery-synthetic-holdout-2026-08-27.json",
        playbook: "supabase/functions/mobile-api/_shared/kael/learning/playbooks/upholstery.ts",
      },
      plumbing: {
        corpus: "docs/playbooks/eval/plumbing-cases.json",
        holdout: "docs/playbooks/eval/plumbing-synthetic-holdout-2026-08-27.json",
        playbook: "supabase/functions/mobile-api/_shared/kael/learning/playbooks/plumbing.ts",
      },
      electrical: {
        corpus: "docs/playbooks/eval/electrical-cases.json",
        holdout: "docs/playbooks/eval/electrical-synthetic-holdout-2026-08-27.json",
        playbook: "supabase/functions/mobile-api/_shared/kael/learning/playbooks/electrical.ts",
      },
    };
    const requiredRuntime = [
      "supabase/functions/mobile-api/_shared/kael/learning/playbooks/flags.ts",
      "supabase/functions/mobile-api/_shared/kael/learning/playbooks/registry.ts",
      "supabase/functions/mobile-api/_shared/kael/pipeline/intake-runtime.ts",
      "supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation.ts",
      "supabase/functions/mobile-api/_shared/kael/prompts/prompts.ts",
      "supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/advance.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/intake-safety.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/guard.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/create.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/turn.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/evidence.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/intake.ts",
      "supabase/functions/mobile-api/_shared/domains/kael-chat/intake-confirmation.service.ts",
      "supabase/functions/mobile-api/_shared/domains/job/create/analyze.ts",
      "supabase/functions/mobile-api/_shared/kael/pipeline/prepare.ts",
      "supabase/functions/mobile-api/_shared/kael/pipeline/stage-intent.ts",
      "supabase/functions/mobile-api/_shared/kael/tools/intent.ts",
      "supabase/functions/mobile-api/_shared/kael/learning/playbooks/electrical.ts",
    ];
    const expectedEvaluator = [
      "apps/api/scripts/kael-playbook-production-canary.mjs",
      "apps/api/scripts/kael-playbook-production-attest.mjs",
      "apps/api/scripts/lib/kael-playbook-production-attestation.mjs",
      "apps/api/scripts/lib/plan55-production-canary-core.mjs",
      "apps/api/scripts/kael-playbook-eval.mjs",
      "apps/api/scripts/lib/kael-playbook-eval-core.mjs",
      "scripts/harness/release-control-client.mjs",
      "scripts/run-supabase.ps1",
    ];

    expect(PLAN55_SOURCE_ASSETS).toEqual(expectedAssets);
    expect(PLAN55_RUNTIME_SOURCE_PATHS).toEqual(requiredRuntime);
    expect(PLAN55_EVALUATOR_PATHS).toEqual(expectedEvaluator);
    expect(assertPlan55SourceAttestation(createAttestation(), sourceSha).services).toHaveLength(6);
  });

  it("refuses a source whose actor guard is not in the active deployed release", () => {
    const unshippedGuard = createAttestation();
    const guardPath = "supabase/functions/mobile-api/_shared/kael/learning/playbooks/flags.ts";
    const guardFile = unshippedGuard.runtime_files.find((file) => file.path === guardPath);
    expect(guardFile, pillarWhy(PILLAR, "actor guard source file is attested")).toBeDefined();
    guardFile!.working_tree_matches_release_after_git_clean_filter = false;

    expect(() => assertPlan55SourceAttestation(unshippedGuard, sourceSha),
      pillarWhy(PILLAR, "unshipped actor guard is rejected before Production evaluation"),
    ).toThrow("local asset does not match the active release");
  });

  it("rejects an incomplete or wrong-release identity", () => {
    const missingRuntime = createAttestation();
    missingRuntime.runtime_files.pop();
    expect(() => assertPlan55SourceAttestation(missingRuntime, sourceSha))
      .toThrow("runtime source attestation is incomplete");

    const wrongRelease = createAttestation();
    delete wrongRelease.services.electrical.holdout;
    expect(() => assertPlan55SourceAttestation(wrongRelease, sourceSha))
      .toThrow("six-service attestation is incomplete");

    expect(() => assertPlan55SourceAttestation(createAttestation(), "4b3c62ac3dbd642f278ea75c9320f7c97181e4fa"))
      .toThrow("source SHA does not match the active release");
  });
});
