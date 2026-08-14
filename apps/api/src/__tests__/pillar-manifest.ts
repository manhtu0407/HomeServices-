// Diagnostic contract shared by every pillar test.
//
// A pillar failure must answer, without a second run: which invariant broke, which rule
// it came from, what else to look at, and whether the test could have failed at all.
// That last question is why `mutation` is required — a pillar is only trusted once its
// recorded mutation has been observed red.
//
// This file is duplicated per package rather than imported across one. jest (apps/mobile)
// resolves only the root `@nestscout/shared` entry, and test-only helpers do not belong in
// a product barrel that ships to the device. scripts/harness/pillar-registry.mjs enforces
// that the copies stay byte-identical, the same way check-skills-sync.mjs does for skills.

export type PillarLayer =
  | 'unit'
  | 'integration'
  | 'static-type'
  | 'security-negative'
  | 'ui-visual'
  | 'sql'

export type PillarManifest = {
  readonly id: string
  readonly invariant: string
  readonly authority: readonly string[]
  readonly target: string
  readonly layer: PillarLayer
  readonly siblings: readonly string[]
  readonly mutation: string
}

export function pillarWhy(pillar: PillarManifest, detail?: string): string {
  const lines = [
    `[${pillar.id}] ${pillar.invariant}`,
    `authority: ${pillar.authority.join(' | ')}`,
    `target:    ${pillar.target}`,
    `next:      ${pillar.siblings.length > 0 ? pillar.siblings.join(', ') : '(none)'}`,
  ]
  if (detail !== undefined) lines.push(`detail:    ${detail}`)
  return lines.join('\n')
}

// jest's expect() accepts no message argument, so mobile pillars wrap the assertion
// instead of passing pillarWhy() as a second argument the way the vitest pillars do.
export function withPillarContext(
  pillar: PillarManifest,
  assertion: () => void,
  detail?: string,
): void {
  try {
    assertion()
  } catch (error) {
    if (error instanceof Error) {
      error.message = `${pillarWhy(pillar, detail)}\n\n${error.message}`
    }
    throw error
  }
}

// A prerequisite that is merely absent is a loud skip; one that is present but
// misconfigured is a throw. "Environment unavailable" must never read as "code is fine".
export function pillarPrerequisite(
  pillar: PillarManifest,
  probe: { available: boolean; misconfigured?: string; hint: string },
): boolean {
  if (probe.misconfigured !== undefined) {
    throw new Error(pillarWhy(pillar, `prerequisite misconfigured: ${probe.misconfigured}`))
  }
  if (!probe.available) {
    console.warn(`[${pillar.id}] skipped, prerequisite unavailable. ${probe.hint}`)
    return false
  }
  return true
}
