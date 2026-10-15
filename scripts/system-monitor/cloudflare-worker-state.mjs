import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export async function readCloudflareWorkerState(input) {
  const accountId = input?.accountId?.trim() ?? ''
  const workerName = input?.workerName?.trim() ?? ''
  const apiToken = input?.apiToken?.trim() ?? ''
  const fetcher = input?.fetcher ?? fetch
  if (!/^[0-9a-f]{32}$/u.test(accountId) || !/^[a-z0-9-]{1,63}$/u.test(workerName) || apiToken.length < 20) {
    throw new Error('CLOUDFLARE_WORKER_STATE_CONFIGURATION_INVALID')
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}`
  const read = async (endpoint, allowMissing = false) => {
    let response
    try {
      response = await fetcher(`${base}/${endpoint}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${apiToken}` },
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      })
    } catch {
      throw new Error('CLOUDFLARE_WORKER_STATE_UNAVAILABLE')
    }
    if (allowMissing && response.status === 404) return null
    if (response.redirected || !response.ok) throw new Error(`CLOUDFLARE_WORKER_STATE_FAILED_${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new Error('CLOUDFLARE_WORKER_STATE_RESPONSE_INVALID')
    }
  }

  const payload = await read('deployments', true)
  if (payload === null) return Object.freeze({ exists: false })
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
  const versionId = versions[0].version_id
  if (typeof input.versionListProvider !== 'function') throw new Error('CLOUDFLARE_WORKER_STATE_VERSION_LIST_UNAVAILABLE')
  let versionPayload
  try {
    versionPayload = await input.versionListProvider()
  } catch {
    throw new Error('CLOUDFLARE_WORKER_STATE_VERSION_LIST_UNAVAILABLE')
  }
  const workerVersions = Array.isArray(versionPayload)
    ? versionPayload
    : Array.isArray(versionPayload?.result)
      ? versionPayload.result
      : Array.isArray(versionPayload?.result?.items)
        ? versionPayload.result.items
        : Array.isArray(versionPayload?.items)
          ? versionPayload.items
          : null
  if (!workerVersions) throw new Error('CLOUDFLARE_WORKER_STATE_RESPONSE_INVALID')
  const version = workerVersions.find((item) => (item?.id ?? item?.version_id) === versionId)
  if (!version) throw new Error('CLOUDFLARE_WORKER_STATE_VERSION_MISSING')

  const schedulePayload = await read('schedules')
  const schedules = schedulePayload?.success === true && Array.isArray(schedulePayload.result?.schedules)
    ? schedulePayload.result.schedules
    : schedulePayload?.success === true && Array.isArray(schedulePayload.schedules)
      ? schedulePayload.schedules
      : null
  if (!schedules || schedules.some((item) => typeof item?.cron !== 'string' || item.cron.length === 0)) {
    throw new Error('CLOUDFLARE_WORKER_STATE_SCHEDULES_INVALID')
  }
  return Object.freeze({
    exists: true,
    deploymentId: current.id,
    versionId,
    createdAt: typeof current.created_on === 'string' ? current.created_on : null,
    releaseTag: typeof version.annotations?.['workers/tag'] === 'string' ? version.annotations['workers/tag'] : null,
    releaseMessage: typeof version.annotations?.['workers/message'] === 'string' ? version.annotations['workers/message'] : null,
    cronSchedules: schedules.map((item) => item.cron),
  })
}

export async function restoreCloudflareWorkerSchedules(input) {
  const { accountId, workerName, apiToken, cronSchedules } = input ?? {}
  if (accountId !== '45dec251ed1c9627256f9b6ba24bcdff' || workerName !== 'nestscout-system-health-observer' ||
      typeof apiToken !== 'string' || apiToken.length < 20 || !Array.isArray(cronSchedules) || cronSchedules.length > 3 ||
      cronSchedules.some((cron) => typeof cron !== 'string' || !/^[0-9A-Za-z*,/ -]{9,100}$/u.test(cron))) {
    throw new Error('CLOUDFLARE_SCHEDULE_RESTORE_CONFIGURATION_INVALID')
  }
  try {
    const response = await (input.fetcher ?? fetch)(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/schedules`, {
        method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(cronSchedules.map((cron) => ({ cron }))),
      })
    if (!response.ok) { await response.body?.cancel(); throw new Error('write failed') }
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > 16384) throw new Error('response too large')
    const result = JSON.parse(text)
    const restored = result?.result?.schedules
    if (result?.success !== true || !Array.isArray(restored) ||
        JSON.stringify(restored.map((item) => item?.cron).sort()) !== JSON.stringify([...cronSchedules].sort())) {
      throw new Error('schedule mismatch')
    }
  } catch {
    throw new Error('CLOUDFLARE_SCHEDULE_RESTORE_FAILED')
  }
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const workerName = process.env.SYSTEM_HEALTH_CLOUDFLARE_WORKER_NAME
  const restoreFrom = process.env.CLOUDFLARE_WORKER_RESTORE_SCHEDULES_FROM
  if (restoreFrom) {
    const before = JSON.parse(readFileSync(restoreFrom, 'utf8'))
    await restoreCloudflareWorkerSchedules({ accountId, workerName, apiToken: process.env.CLOUDFLARE_API_TOKEN,
      cronSchedules: before.cronSchedules })
    process.stdout.write('Captured Cloudflare Cron schedules restored\n')
    return
  }
  const state = await readCloudflareWorkerState({
    accountId,
    workerName,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    versionListProvider: () => readWranglerWorkerVersions({ accountId, workerName }),
  })
  const output = process.env.CLOUDFLARE_WORKER_STATE_OUTPUT
  if (output) writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(state.exists ? 'previous Cloudflare Worker deployment captured\n' : 'no previous Cloudflare Worker deployment found\n')
}

function readWranglerWorkerVersions(input) {
  const args = ['exec', 'wrangler', 'versions', 'list', '--name', input.workerName,
    '--config', 'scripts/system-monitor/wrangler.jsonc', '--json']
  const options = {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: input.accountId },
    maxBuffer: 131072,
    timeout: 10000,
    windowsHide: true,
  }
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], options)
    : spawnSync('pnpm', args, options)
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error('CLOUDFLARE_WORKER_STATE_VERSION_LIST_FAILED')
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error('CLOUDFLARE_WORKER_STATE_VERSION_LIST_INVALID')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'CLOUDFLARE_WORKER_STATE_FAILED'}\n`)
    process.exitCode = 1
  })
}
