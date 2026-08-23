import { assertReleaseTarget } from './release-safety.mjs'

const SAFE_RPC_NAME = /^[a-z][a-z0-9_]{1,80}$/u
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u

export function createReleaseControlClient(input) {
  const target = assertReleaseTarget(input)
  const serviceRoleKey = input.serviceRoleKey?.trim()
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for hosted release control')
  const fetchImpl = input.fetchImpl ?? fetch
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  }
  return Object.freeze({
    async rpc(name, args) {
      if (!SAFE_RPC_NAME.test(name)) throw new Error('hosted RPC name is invalid')
      const response = await fetchImpl(`${target.projectUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(args ?? {}),
      })
      const body = await response.text()
      if (!response.ok) throw new Error(`hosted RPC ${name} failed with HTTP ${response.status}`)
      return body ? JSON.parse(body) : null
    },
    async selectControl() {
      const response = await fetchImpl(
        `${target.projectUrl}/rest/v1/stage1_release_controls?select=active_release_id,previous_active_release_id,candidate_release_id,candidate_cohort_id,candidate_packet_sha256,candidate_started_at,revision&environment=eq.${target.environment}`,
        { method: 'GET', headers },
      )
      const body = await response.text()
      if (!response.ok) throw new Error(`hosted release control read failed with HTTP ${response.status}`)
      const rows = body ? JSON.parse(body) : []
      if (!Array.isArray(rows) || rows.length > 1) throw new Error('hosted release control response is invalid')
      return rows[0] ?? null
    },
    async selectRelease(releaseId) {
      if (!RELEASE_ID.test(releaseId ?? '')) throw new Error('hosted release artifact ID is invalid')
      const response = await fetchImpl(
        `${target.projectUrl}/rest/v1/harness_releases?select=release_artifact&environment=eq.${target.environment}&release_id=eq.${releaseId}`,
        { method: 'GET', headers },
      )
      const body = await response.text()
      if (!response.ok) throw new Error(`hosted release artifact read failed with HTTP ${response.status}`)
      const rows = body ? JSON.parse(body) : []
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.release_artifact) {
        throw new Error('hosted release artifact response is invalid')
      }
      return rows[0].release_artifact
    },
    target,
  })
}

export function releaseRegistrationArgs(release, previousReleaseId) {
  return {
    p_release_id: release.releaseId,
    p_environment: release.environment,
    p_git_sha: release.gitSha,
    p_manifest_sha256: release.manifestSha256,
    p_migration_inventory_sha256: release.migrationInventorySha256,
    p_database_types_sha256: release.databaseTypesSha256,
    p_prompt_bundle_sha256: release.promptBundleSha256,
    p_policy_bundle_sha256: release.policyBundleSha256,
    p_runtime_configuration_sha256: release.runtimeConfigurationSha256,
    p_evaluation_suite_version: release.evaluationSuiteVersion,
    p_evaluation_suite_sha256: release.evaluationSuiteSha256,
    p_capability_registry_sha256: release.capabilityRegistrySha256,
    p_access_matrix_sha256: release.accessMatrixSha256,
    p_reliability_policy_sha256: release.reliabilityPolicySha256,
    p_promotion_policy_sha256: release.promotionPolicySha256,
    p_bundle_sha256: release.bundleSha256,
    p_edge_function_digests: release.edgeFunctions,
    p_release_artifact: release,
    p_previous_release_id: previousReleaseId ?? null,
    p_created_by: 'github-actions-release',
    p_safe_metadata: { registration_method: 'postmerge-release-pipeline' },
  }
}
