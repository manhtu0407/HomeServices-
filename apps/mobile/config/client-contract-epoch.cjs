function resolveClientContractEpoch({ buildReleaseId, easBuildId, gitSha }) {
  const isEasBuildId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(easBuildId)
  return buildReleaseId && gitSha && isEasBuildId ? '2' : ''
}

module.exports = { resolveClientContractEpoch }
