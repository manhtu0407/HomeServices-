export function validateMigrationEquivalences(equivalences, entries) {
  const problems = []
  if (equivalences?.version !== '1.0.0' || !Array.isArray(equivalences.groups)) {
    return ['migration equivalence registry is invalid']
  }
  const entriesByVersion = new Map((entries ?? []).map((entry) => [String(entry.version), entry]))
  const registeredVersions = new Set()
  for (const group of equivalences.groups) {
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/u.test(group?.id ?? '') ||
        !/^\d{14}$/u.test(group?.canonicalVersion ?? '') ||
        !/^[0-9a-f]{64}$/u.test(group?.semanticSha256 ?? '') ||
        !Array.isArray(group?.versions) || group.versions.length < 2 ||
        new Set(group.versions).size !== group.versions.length ||
        group.versions.join('\n') !== [...group.versions].sort().join('\n') ||
        !group.versions.includes(group.canonicalVersion)) {
      problems.push(`migration equivalence group is invalid: ${group?.id ?? 'unknown'}`)
      continue
    }
    for (const version of group.versions) {
      if (!entriesByVersion.has(version)) problems.push(`migration equivalence version is missing: ${version}`)
      if (registeredVersions.has(version)) problems.push(`migration equivalence version is duplicated: ${version}`)
      registeredVersions.add(version)
    }
  }
  return problems
}

export function migrationEquivalenceIndex(equivalences) {
  const byVersion = new Map()
  for (const group of equivalences?.groups ?? []) {
    for (const version of group.versions ?? []) byVersion.set(String(version), group)
  }
  return byVersion
}

export function canonicalMigrationEntries(inventory) {
  const byVersion = migrationEquivalenceIndex(inventory?.migrationEquivalences)
  return (inventory?.entries ?? []).filter((entry) => {
    const group = byVersion.get(String(entry.version))
    return !group || group.canonicalVersion === entry.version
  })
}

export function resolveHostedMigrationState(inventory, hostedRows) {
  if (!Array.isArray(inventory?.entries) || inventory.entries.length === 0) {
    throw new Error('migration inventory is empty or invalid')
  }
  if (!Array.isArray(hostedRows)) throw new Error('hosted migration history is not an array')
  const equivalenceProblems = validateMigrationEquivalences(
    inventory.migrationEquivalences,
    inventory.entries,
  )
  if (equivalenceProblems.length) throw new Error(equivalenceProblems.join('; '))
  const entriesByVersion = new Map(inventory.entries.map((entry) => [String(entry.version), entry]))
  const equivalences = migrationEquivalenceIndex(inventory.migrationEquivalences)
  const rawVersions = hostedRows.map((row) => String(row?.version ?? row?.id ?? ''))
  if (rawVersions.some((version) => !/^\d{14}$/u.test(version))) {
    throw new Error('hosted migration history contains an invalid version')
  }
  if (new Set(rawVersions).size !== rawVersions.length) {
    throw new Error('hosted migration history contains duplicate versions')
  }
  if (rawVersions.join('\n') !== [...rawVersions].sort().join('\n')) {
    throw new Error('hosted migration history is out of order')
  }
  const unknown = rawVersions.filter((version) => !entriesByVersion.has(version))
  if (unknown.length) throw new Error(`hosted migration history has unknown versions: ${unknown.join(', ')}`)
  const appliedCanonicalVersions = new Set()
  const appliedEquivalenceGroups = new Map()
  for (const version of rawVersions) {
    const group = equivalences.get(version)
    const canonicalVersion = group?.canonicalVersion ?? version
    if (group) {
      const previous = appliedEquivalenceGroups.get(group.id)
      if (previous && previous !== version) {
        throw new Error(`hosted migration history applied multiple equivalent versions: ${group.id}`)
      }
      appliedEquivalenceGroups.set(group.id, version)
    }
    appliedCanonicalVersions.add(canonicalVersion)
  }
  return {
    rawVersions,
    appliedCanonicalVersions,
    appliedEquivalenceGroups,
  }
}

export function semanticMigrationSource(value) {
  return value.replace(/\r\n/gu, '\n').replace(/(?:\n\s*;\s*)+$/u, '\n')
}
