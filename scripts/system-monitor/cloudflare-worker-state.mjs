import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export async function readCloudflareWorkerState(input) {
  const accountId = input?.accountId?.trim() ?? ''
  const workerName = input?.workerName?.trim() ?? ''
  const apiToken = input?.apiToken?.trim() ?? ''
  const fetcher = input?.fetcher ?? fetch
  if (!/^[0-9a-f]{32}$/u.test(accountId) || !/^[a-z0-9-]{1,63}$/u.test(workerName) || apiToken.length < 20) {
    throw new Error('CLOUDFLARE_WORKER_STATE_CONFIGURATION_INVALID')
  }

  let response
  try {
    response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/deployments`, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new Error('CLOUDFLARE_WORKER_STATE_UNAVAILABLE')
  }
  if (response.status === 404) return Object.freeze({ exists: false })
  if (!response.ok) throw new Error(`CLOUDFLARE_WORKER_STATE_FAILED_${response.status}`)

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('CLOUDFLARE_WORKER_STATE_RESPONSE_INVALID')
  }
  const deployments = payload?.success === true && Array.isArray(payload.result)
    ? payload.result
    : payload?.success === true && Array.isArray(payload.result?.deployments)
      ? payload.result.deployments
      : null
  if (!deployments) throw new Error('CLOUDFLARE_WORKER_STATE_RESPONSE_INVALID')
  const current = deployments[0]
  if (!current) return Object.freeze({ exists: false })

  const versions = current.versions
  if (typeof current.id !== 'string' || !Array.isArray(versions) || versions.length !== 1 ||
      typeof versions[0].version_id !== 'string' || versions[0].percentage !== 100) {
    throw new Error('CLOUDFLARE_WORKER_STATE_AMBIGUOUS')
  }
  return Object.freeze({
    exists: true,
    deploymentId: current.id,
    versionId: versions[0].version_id,
    createdAt: typeof current.created_on === 'string' ? current.created_on : null,
    releaseTag: current.annotations?.['workers/tag'] ?? null,
  })
}

async function main() {
  const state = await readCloudflareWorkerState({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    workerName: process.env.SYSTEM_HEALTH_CLOUDFLARE_WORKER_NAME,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  })
  const output = process.env.CLOUDFLARE_WORKER_STATE_OUTPUT
  if (output) writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(state.exists ? 'previous Cloudflare Worker deployment captured\n' : 'no previous Cloudflare Worker deployment found\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'CLOUDFLARE_WORKER_STATE_FAILED'}\n`)
    process.exitCode = 1
  })
}
