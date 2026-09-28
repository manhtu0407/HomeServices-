export const PRODUCTION_PROJECT_REF = 'iwevizmsedyqozxlawwl'
export const PRODUCTION_MOBILE_API_URL =
  `https://${PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/mobile-api`

const SHA256_PATTERN = /^[0-9a-f]{64}$/i
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i

export const PLAN55_SOURCE_ASSETS = Object.freeze({
  hvac: {
    corpus: 'docs/playbooks/eval/hvac-cases.json',
    holdout: 'docs/playbooks/eval/hvac-synthetic-holdout-2026-08-27.json',
    playbook: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/hvac.ts',
  },
  handyman: {
    corpus: 'docs/playbooks/eval/handyman-cases.json',
    holdout: 'docs/playbooks/eval/handyman-synthetic-holdout-2026-08-27.json',
    playbook: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/handyman.ts',
  },
  cleaning: {
    corpus: 'docs/playbooks/eval/cleaning-cases.json',
    holdout: 'docs/playbooks/eval/cleaning-synthetic-holdout-2026-08-27.json',
    playbook: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/cleaning.ts',
  },
  upholstery: {
    corpus: 'docs/playbooks/eval/upholstery-cases.json',
    holdout: 'docs/playbooks/eval/upholstery-synthetic-holdout-2026-08-27.json',
    playbook: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/upholstery.ts',
  },
  plumbing: {
    corpus: 'docs/playbooks/eval/plumbing-cases.json',
    holdout: 'docs/playbooks/eval/plumbing-synthetic-holdout-2026-08-27.json',
    playbook: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/plumbing.ts',
  },
  electrical: {
    corpus: 'docs/playbooks/eval/electrical-cases.json',
    holdout: 'docs/playbooks/eval/electrical-synthetic-holdout-2026-08-27.json',
    playbook: 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/electrical.ts',
  },
})

export const PLAN55_RUNTIME_SOURCE_PATHS = Object.freeze([
  'supabase/functions/mobile-api/_shared/kael/learning/playbooks/flags.ts',
  'supabase/functions/mobile-api/_shared/kael/learning/playbooks/registry.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/intake-runtime.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation.ts',
  'supabase/functions/mobile-api/_shared/kael/prompts/prompts.ts',
  'supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/advance.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/intake-safety.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/guard.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/create.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/turn.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/evidence.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/intake.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/intake-confirmation.service.ts',
  'supabase/functions/mobile-api/_shared/domains/job/create/analyze.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/prepare.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/stage-intent.ts',
  'supabase/functions/mobile-api/_shared/kael/tools/intent.ts',
  'supabase/functions/mobile-api/_shared/kael/learning/playbooks/electrical.ts',
])

export const PLAN55_EVALUATOR_PATHS = Object.freeze([
  'apps/api/scripts/kael-playbook-production-canary.mjs',
  'apps/api/scripts/kael-playbook-production-attest.mjs',
  'apps/api/scripts/lib/kael-playbook-production-attestation.mjs',
  'apps/api/scripts/lib/plan55-production-canary-core.mjs',
  'apps/api/scripts/kael-playbook-eval.mjs',
  'apps/api/scripts/lib/kael-playbook-eval-core.mjs',
  'scripts/harness/release-control-client.mjs',
  'scripts/run-supabase.ps1',
])

const SERVICE_NAMES = Object.freeze(Object.keys(PLAN55_SOURCE_ASSETS))

export function assertPlan55SourceAttestation(value, expectedSourceSha) {
  const attestation = objectRecord(value, 'invalid_plan55_source_attestation')
  if (attestation.schema !== 'plan55-production-source-attestation/v1') {
    throw new Error('invalid_plan55_source_attestation_schema')
  }
  const deployment = objectRecord(attestation.deployment, 'invalid_plan55_attestation_deployment')
  if (deployment.project_ref !== PRODUCTION_PROJECT_REF) {
    throw new Error('plan55_attestation_wrong_production_project')
  }
  const sourceSha = requireMatch(deployment.git_sha, GIT_SHA_PATTERN, 'invalid_plan55_attestation_source_sha').toLowerCase()
  if (sourceSha !== String(expectedSourceSha).toLowerCase()) {
    throw new Error('source SHA does not match the active release')
  }
  if (attestation.endpoint !== `${PRODUCTION_MOBILE_API_URL}/harness/health`) {
    throw new Error('plan55_attestation_endpoint_mismatch')
  }

  const runtimeFiles = attestation.runtime_files
  if (!Array.isArray(runtimeFiles) || runtimeFiles.length !== PLAN55_RUNTIME_SOURCE_PATHS.length ||
      runtimeFiles.some((file, index) => file?.path !== PLAN55_RUNTIME_SOURCE_PATHS[index])) {
    throw new Error('runtime source attestation is incomplete or out of order')
  }
  for (const file of runtimeFiles) validateAttestedFile(file)

  const evaluator = objectRecord(attestation.evaluator, 'Plan 55 evaluator attestation is missing')
  if (!Array.isArray(evaluator.files) || evaluator.files.length !== PLAN55_EVALUATOR_PATHS.length ||
      PLAN55_EVALUATOR_PATHS.some((path, index) => evaluator.files[index] !== path)) {
    throw new Error('Plan 55 evaluator attestation is incomplete or out of order')
  }
  prefixedDigest(evaluator.sha256, 'invalid_plan55_evaluator_hash')

  const services = objectRecord(attestation.services, 'six-service attestation is incomplete')
  if (Object.keys(services).length !== SERVICE_NAMES.length ||
      SERVICE_NAMES.some((service) => !Object.hasOwn(services, service))) {
    throw new Error('six-service attestation is incomplete')
  }
  for (const [service, expectedPaths] of Object.entries(PLAN55_SOURCE_ASSETS)) {
    const assets = objectRecord(services[service], 'six-service attestation is incomplete')
    for (const [kind, expectedPath] of Object.entries(expectedPaths)) {
      const asset = objectRecord(assets[kind], 'six-service attestation is incomplete')
      if (asset.path !== expectedPath) throw new Error('asset path does not match the service inventory')
      validateAttestedFile(asset)
    }
    if (Object.keys(assets).length !== 3) throw new Error('six-service attestation is incomplete')
  }
  return Object.freeze({ sourceSha, services: SERVICE_NAMES })
}

export function validateProductionEvalTargets(mobileApiUrl, supabaseUrl, productionCanaryOptIn) {
  if (productionCanaryOptIn !== true) throw new Error('production_canary_opt_in_required')
  const expectedHost = `${PRODUCTION_PROJECT_REF}.supabase.co`
  const api = validatedHttpsUrl(mobileApiUrl, 'mobile_api')
  if (
    api.hostname !== expectedHost ||
    api.pathname.replace(/\/+$/, '') !== '/functions/v1/mobile-api'
  ) {
    throw new Error('unapproved_production_mobile_api_target')
  }

  let normalizedSupabaseUrl = null
  if (supabaseUrl) {
    const supabase = validatedHttpsUrl(supabaseUrl, 'supabase')
    if (supabase.hostname !== expectedHost || supabase.pathname.replace(/\/+$/, '') !== '') {
      throw new Error('unapproved_production_supabase_target')
    }
    normalizedSupabaseUrl = supabase.toString().replace(/\/$/, '')
  }

  return {
    mobileApiUrl: api.toString().replace(/\/$/, ''),
    supabaseUrl: normalizedSupabaseUrl,
  }
}

export function validateProductionHealthPayload(value) {
  const health = objectRecord(value, 'invalid_production_health_payload')
  if (health.service !== 'mobile-api') throw new Error('production_health_wrong_service')
  if (health.status !== 'ok') throw new Error('production_health_not_ok')

  const environment = objectRecord(health.environment, 'production_health_missing_environment')
  if (environment.project_ref !== PRODUCTION_PROJECT_REF) {
    throw new Error('production_health_wrong_project')
  }
  if (environment.provider_configuration_class !== 'production-locked') {
    throw new Error('production_health_provider_boundary_mismatch')
  }
  if (environment.webhook_configuration_class !== 'production-signed') {
    throw new Error('production_health_webhook_boundary_mismatch')
  }

  const release = objectRecord(health.release, 'production_health_missing_release')
  if (release.registered !== true) throw new Error('production_health_release_unregistered')
  const gitSha = requireMatch(release.git_sha, GIT_SHA_PATTERN, 'production_health_invalid_git_sha')
  const releaseId = requireString(release.release_id, 'production_health_invalid_release_id')
  if (!new RegExp(`^harness-${gitSha.slice(0, 12)}-[a-z0-9-]{6,40}$`, 'i').test(releaseId)) {
    throw new Error('production_health_release_sha_mismatch')
  }
  const deploymentId = requireString(release.deployment_id, 'production_health_invalid_deployment_id')
  if (!deploymentId.startsWith(`${PRODUCTION_PROJECT_REF}_`)) {
    throw new Error('production_health_deployment_project_mismatch')
  }

  return Object.freeze({
    source: 'public_harness_health',
    project_ref: PRODUCTION_PROJECT_REF,
    status: 'ok',
    provider_configuration_class: environment.provider_configuration_class,
    webhook_configuration_class: environment.webhook_configuration_class,
    release_id: releaseId,
    deployment_id: deploymentId,
    git_sha: gitSha.toLowerCase(),
    manifest_sha256: digest(release.manifest_sha256, 'production_health_invalid_manifest_hash'),
    bundle_sha256: digest(release.bundle_sha256, 'production_health_invalid_bundle_hash'),
    source_bundle_sha256: digest(
      release.source_bundle_sha256,
      'production_health_invalid_source_bundle_hash',
    ),
    edge_bundle_sha256: digest(
      release.edge_bundle_sha256,
      'production_health_invalid_edge_bundle_hash',
    ),
  })
}

function validatedHttpsUrl(value, label) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`invalid_${label}_url`)
  }
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search ||
    parsed.hash || (parsed.port && parsed.port !== '443')
  ) {
    throw new Error(`invalid_${label}_url`)
  }
  return parsed
}

function objectRecord(value, errorCode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorCode)
  return value
}

function requireString(value, errorCode) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error(errorCode)
  }
  return value
}

function requireMatch(value, pattern, errorCode) {
  const normalized = requireString(value, errorCode)
  if (!pattern.test(normalized)) throw new Error(errorCode)
  return normalized
}

function digest(value, errorCode) {
  return `sha256:${requireMatch(value, SHA256_PATTERN, errorCode).toLowerCase()}`
}

function validateAttestedFile(asset) {
  requireMatch(asset.git_blob_sha1, GIT_SHA_PATTERN, 'invalid_plan55_attestation_git_blob')
  prefixedDigest(asset.deployed_sha256, 'invalid_plan55_attestation_deployed_hash')
  prefixedDigest(asset.working_tree_sha256, 'invalid_plan55_attestation_working_tree_hash')
  if (asset.working_tree_matches_release_after_git_clean_filter !== true) {
    throw new Error('local asset does not match the active release')
  }
}

function prefixedDigest(value, errorCode) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(value)) {
    throw new Error(errorCode)
  }
  return value.toLowerCase()
}
