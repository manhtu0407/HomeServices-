import { loopbackQaDockerArgs } from './local-qa-network.mjs'

/** @param {Record<string, string | undefined>} env */
export function resolveLocalQaHttpTarget(env) {
  const instance = env.NESTSCOUT_QA_HTTP_INSTANCE
  if (instance === undefined) return null
  const invalid = () => { throw new Error('QA HTTP target is misconfigured') }
  const portBase = Number(env.NESTSCOUT_QA_HTTP_PORT_BASE)
  try {
    loopbackQaDockerArgs(instance, portBase, 'node', [])
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    if (url.href !== `http://127.0.0.1:${portBase + 1}/`) invalid()
  } catch { invalid() }
  const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const isDemo = (value, role) => {
    if (typeof value !== 'string' || value.length > 8192 || value.split('.').length !== 3) return false
    try {
      const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'))
      return payload.iss === 'supabase-demo' && payload.role === role
    } catch { return false }
  }
  if (!isDemo(anonKey, 'anon') || !isDemo(serviceRoleKey, 'service_role')) invalid()
  return { instance, portBase, url: `http://127.0.0.1:${portBase + 1}`, anonKey, serviceRoleKey }
}
