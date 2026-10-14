import { pathToFileURL } from 'node:url'

export async function configureSystemHealthMonitorSecret(input) {
  const base = input?.supabaseUrl?.trim() ?? ''
  const serviceRoleKey = input?.serviceRoleKey?.trim() ?? ''
  const monitorSecret = input?.monitorSecret?.trim() ?? ''
  const fetcher = input?.fetcher ?? fetch
  let url

  try {
    url = new URL(base)
  } catch {
    throw new Error('SYSTEM_HEALTH_SECRET_TARGET_INVALID')
  }

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' ||
      url.username || url.password || url.search || url.hash || serviceRoleKey.length < 32 ||
      !/^[0-9a-f]{64}$/u.test(monitorSecret)) {
    throw new Error('SYSTEM_HEALTH_SECRET_CONFIGURATION_INVALID')
  }

  let response
  try {
    response = await fetcher(new URL('/rest/v1/rpc/configure_system_health_monitor_secret', url), {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_secret: monitorSecret }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new Error('SYSTEM_HEALTH_SECRET_CONFIGURATION_UNAVAILABLE')
  }

  if (!response.ok) throw new Error(`SYSTEM_HEALTH_SECRET_CONFIGURATION_FAILED_${response.status}`)

  let configured
  try {
    configured = await response.json()
  } catch {
    throw new Error('SYSTEM_HEALTH_SECRET_CONFIGURATION_INVALID_RESPONSE')
  }
  if (configured !== true) throw new Error('SYSTEM_HEALTH_SECRET_CONFIGURATION_REJECTED')
  return Object.freeze({ configured: true })
}

async function main() {
  const result = await configureSystemHealthMonitorSecret({
    supabaseUrl: process.env.PRODUCTION_PROJECT_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    monitorSecret: process.env.SYSTEM_HEALTH_MONITOR_SECRET,
  })
  if (result.configured) process.stdout.write('system health Vault credential configured\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'SYSTEM_HEALTH_SECRET_CONFIGURATION_FAILED'}\n`)
    process.exitCode = 1
  })
}
