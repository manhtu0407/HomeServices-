import { ApiFailure } from "../platform/api-failure.ts";
import type { MobileApiHandlerDeps } from "./contracts.ts";
import { enforceClientCompatibility } from "./request-runtime.ts";
import type { PillarManifest } from "../../../../../apps/api/src/__tests__/pillar-manifest.ts";

export const PILLAR = {
  id: 'P388-mobile-client-contract-compatibility',
  invariant:
    'The immediate legacy client epoch is accepted only at its explicit platform build floor, older epochs are refused, and current clients must match the registered release identity.',
  authority: [
    'governance/RULES.md #0 (mobile runtime boundary)',
    'apps/mobile/config/release-client-policy.json',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/request-runtime.ts',
  layer: 'security-negative',
  siblings: ['P351-system-health-monitor-contract', 'P356-system-health-mobile-telemetry-rate-limit'],
  mutation:
    'Lower the legacy build floor, allow an older epoch, or remove one current-release identity check; the accepted-floor and refusal cases turn red.',
} as const satisfies PillarManifest;

const compatibility = {
  contractEpoch: 3,
  gitSha: "a".repeat(40),
  releaseId: `harness-${"a".repeat(12)}-${"b".repeat(12)}`,
  ios: {
    applicationId: "com.phanmanhtu.homeservices",
    minimumBuildNumber: 56,
    legacyMinimumBuildNumber: 55,
    easBuildId: "33333333-3333-4333-8333-333333333333",
    runtimeVersion: "0.3.2",
  },
  android: {
    applicationId: "com.phanmanhtu.nestscout",
    minimumBuildNumber: 6,
    legacyMinimumBuildNumber: 5,
    easBuildId: "44444444-4444-4444-8444-444444444444",
    runtimeVersion: "0.3.2",
  },
} as const;

type ClientCompatibility = Omit<typeof compatibility, "ios" | "android"> & {
  ios: {
    applicationId: string;
    minimumBuildNumber: number | null;
    legacyMinimumBuildNumber: number | null;
    easBuildId: string | null;
    easBuildIdMode?: "exact" | "release-bound";
    runtimeVersion: string | null;
  };
  android: {
    applicationId: string;
    minimumBuildNumber: number | null;
    legacyMinimumBuildNumber: number | null;
    easBuildId: string | null;
    easBuildIdMode?: "exact" | "release-bound";
    runtimeVersion: string | null;
  };
};

function request(headers: Record<string, string>): Request {
  return new Request("https://api.example.test/functions/v1/mobile-api/jobs/create", {
    method: "POST",
    headers,
  });
}

function deps(
  clientCompatibility: ClientCompatibility = compatibility,
): MobileApiHandlerDeps {
  return { clientCompatibility } as unknown as MobileApiHandlerDeps;
}

function failure(
  input: Request,
  clientCompatibility: ClientCompatibility = compatibility,
): ApiFailure {
  try {
    enforceClientCompatibility(input, deps(clientCompatibility));
  } catch (error) {
    if (error instanceof ApiFailure) return error;
    throw error;
  }
  throw new Error(`[${PILLAR.id}] expected client compatibility rejection`);
}

Deno.test(`${PILLAR.id}: accepts the immediate legacy epoch at its explicit per-platform floor`, () => {
  enforceClientCompatibility(request({
    "x-client-platform": "ios",
    "x-client-contract-epoch": "2",
    "x-client-application-id": compatibility.ios.applicationId,
    "x-client-build-number": "55",
  }), deps());
  enforceClientCompatibility(request({
    "x-client-platform": "android",
    "x-client-contract-epoch": "2",
    "x-client-application-id": compatibility.android.applicationId,
    "x-client-build-number": "5",
  }), deps());
});

Deno.test(`${PILLAR.id}: rejects the immediate legacy epoch below its floor and all older epochs`, () => {
  for (const headers of [
    {
      "x-client-platform": "ios",
      "x-client-contract-epoch": "2",
      "x-client-application-id": compatibility.ios.applicationId,
      "x-client-build-number": "54",
    },
    {
      "x-client-platform": "ios",
      "x-client-contract-epoch": "1",
      "x-client-application-id": compatibility.ios.applicationId,
      "x-client-build-number": "99",
    },
  ]) {
    if (failure(request(headers)).status !== 426) {
      throw new Error(`[${PILLAR.id}] legacy clients must receive update-required status`);
    }
  }
});

Deno.test(`${PILLAR.id}: requires exact release identity for the current epoch`, () => {
  const current = {
    "x-client-platform": "ios",
    "x-client-contract-epoch": "3",
    "x-client-application-id": compatibility.ios.applicationId,
    "x-client-build-number": "56",
    "x-client-eas-build-id": compatibility.ios.easBuildId,
    "x-client-runtime-version": compatibility.ios.runtimeVersion,
    "x-client-git-sha": compatibility.gitSha,
    "x-client-release-id": compatibility.releaseId,
  };
  enforceClientCompatibility(request(current), deps());
  if (failure(request({ ...current,
    "x-client-eas-build-id": "55555555-5555-4555-8555-555555555555",
  })).status !== 426) {
    throw new Error(`[${PILLAR.id}] mismatched EAS identity must be rejected`);
  }
});

Deno.test(`${PILLAR.id}: accepts the current release-bound iOS build while preserving the previous build floor`, () => {
  const backendRelease = {
    ...compatibility,
    gitSha: "f".repeat(40),
    releaseId: `harness-${"f".repeat(12)}-${"c".repeat(12)}`,
    ios: {
      ...compatibility.ios,
      easBuildId: null,
      easBuildIdMode: "release-bound" as const,
      minimumBuildNumber: 56,
      legacyMinimumBuildNumber: 55,
    },
  } as const;
  const build56 = {
    "x-client-platform": "ios",
    "x-client-contract-epoch": "3",
    "x-client-application-id": compatibility.ios.applicationId,
    "x-client-build-number": "56",
    "x-client-eas-build-id": "66666666-6666-4666-8666-666666666666",
    "x-client-runtime-version": "0.3.2",
    "x-client-git-sha": backendRelease.gitSha,
    "x-client-release-id": backendRelease.releaseId,
  };

  enforceClientCompatibility(request(build56), deps(backendRelease));
  enforceClientCompatibility(request({
    "x-client-platform": "ios",
    "x-client-contract-epoch": "2",
    "x-client-application-id": compatibility.ios.applicationId,
    "x-client-build-number": "55",
  }), deps(backendRelease));
  enforceClientCompatibility(request({
    "x-client-platform": "android",
    "x-client-contract-epoch": "3",
    "x-client-application-id": compatibility.android.applicationId,
    "x-client-build-number": "5",
    "x-client-eas-build-id": "77777777-7777-4777-8777-777777777777",
    "x-client-runtime-version": "0.3.2",
    "x-client-git-sha": backendRelease.gitSha,
    "x-client-release-id": backendRelease.releaseId,
  }), deps({
    ...backendRelease,
    android: {
      ...compatibility.android,
      easBuildId: null,
      easBuildIdMode: "release-bound",
      minimumBuildNumber: 5,
      legacyMinimumBuildNumber: 5,
    },
  }));

  for (const changed of [
    { ...build56, "x-client-build-number": "55" },
    { ...build56, "x-client-eas-build-id": "not-a-uuid" },
    { ...build56, "x-client-git-sha": compatibility.gitSha },
    { ...build56, "x-client-release-id": compatibility.releaseId },
  ]) {
    if (failure(request(changed), backendRelease).status !== 426) {
      throw new Error(`[${PILLAR.id}] release-bound compatibility must still enforce current build identity`);
    }
  }
});
