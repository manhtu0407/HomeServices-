import { pathToFileURL } from 'node:url'

export async function disableSystemHealthMonitorSchedule(input) {
  const base = input?.supabaseUrl?.trim() ?? ''
  const serviceRoleKey = input?.serviceRoleKey?.trim() ?? ''
  const fetcher = input?.fetcher ?? fetch
  let url

  try {
    url = new URL(base)
  } catch {
    throw new Error('SYSTEM_HEALTH_SCHEDULE_TARGET_INVALID')
  }

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' ||
      url.username || url.password || url.search || url.hash || serviceRoleKey.length < 32) {
    throw new Error('SYSTEM_HEALTH_SCHEDULE_CONFIGURATION_INVALID')
  }

  let response
  try {
    response = await fetcher(new URL('/rest/v1/rpc/disable_system_health_monitor', url), {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new Error('SYSTEM_HEALTH_SCHEDULE_UNAVAILABLE')
  }

  if (!response.ok) throw new Error(`SYSTEM_HEALTH_SCHEDULE_FAILED_${response.status}`)

  let disabled
  try {
    disabled = await response.json()
  } catch {
    throw new Error('SYSTEM_HEALTH_SCHEDULE_INVALID_RESPONSE')
  }
  if (disabled !== true) throw new Error('SYSTEM_HEALTH_SCHEDULE_REJECTED')
  return Object.freeze({ disabled: true })
}

async function main() {
  const result = await disableSystemHealthMonitorSchedule({
    supabaseUrl: process.env.PRODUCTION_PROJECT_URL,
    serviceRoleKey: process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY,
  })
  if (result.disabled) process.stdout.write('system health collector schedule disabled\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'SYSTEM_HEALTH_SCHEDULE_FAILED'}\n`)
    process.exitCode = 1
  })
}
