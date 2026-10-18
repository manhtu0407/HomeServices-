import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolveLocalQaHttpTarget } from '../../../../../scripts/harness/local-qa-http-target.mjs'
import { assertLocalQaBindings } from '../../../../../scripts/harness/local-qa-network.mjs'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export type LocalQaActor = { id: string; token: string }

export function localQaRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('QA response must be an object')
  return value as Record<string, unknown>
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('QA response field missing')
  return value
}

export function createLocalQaHttpHarness(pillar: PillarManifest) {
  const target = resolveLocalQaHttpTarget(process.env)
  async function request(path: string, options: {
    method?: string; token?: string; key?: string; body?: unknown; compatible?: boolean
  } = {}) {
    if (!target) throw new Error(pillarWhy(pillar, 'named target absent'))
    const url = new URL(path, target.url)
    if (url.origin !== target.url) throw new Error(pillarWhy(pillar, 'cross-origin QA request refused'))
    const response = await fetch(url, {
      method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: options.key ?? target.serviceRoleKey ?? '',
        authorization: `Bearer ${options.token ?? target.serviceRoleKey ?? ''}`,
        'content-type': 'application/json',
        ...(options.compatible === false ? {} : {
          origin: 'http://localhost:8086', 'x-client-platform': 'web-preview',
          'x-client-contract-epoch': '2',
          'x-client-application-id': 'com.phanmanhtu.nestscout.web-preview',
        }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const body = await response.text()
    const payload: unknown = body ? JSON.parse(body) : null
    return {
      status: response.status, payload,
      fixtureProviderCalls: response.headers.has('x-qa-provider-fixture-calls') ? Number(response.headers.get('x-qa-provider-fixture-calls')) : null,
      fixtureDeniedCalls: response.headers.has('x-qa-denied-calls') ? Number(response.headers.get('x-qa-denied-calls')) : null,
    }
  }
  async function customer(role: 'customer' | 'worker' = 'customer'): Promise<LocalQaActor> {
    const email = `qa-http-${randomUUID()}@example.invalid`
    const password = `Qa!${randomBytes(24).toString('hex')}`
    const created = await request('/auth/v1/admin/users', {
      method: 'POST', body: { email, password, email_confirm: true, user_metadata: { full_name: 'QA HTTP fixture' } },
    })
    if (created.status !== 200) throw new Error(pillarWhy(pillar, 'local Auth fixture creation failed'))
    const id = requiredText(localQaRecord(created.payload).id)
    if (role === 'worker') {
      const changed = await request(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', body: { role } })
      if (changed.status !== 204) throw new Error(pillarWhy(pillar, 'local fixture role setup failed'))
    }
    const signedIn = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', key: target?.anonKey, body: { email, password },
    })
    if (signedIn.status !== 200) throw new Error(pillarWhy(pillar, 'actual password sign-in failed'))
    return { id, token: requiredText(localQaRecord(signedIn.payload).access_token) }
  }
  function seedRows(rows: ReadonlyArray<readonly [string, Record<string, unknown>]>) {
    if (!target) throw new Error(pillarWhy(pillar, 'named target absent'))
    assertLocalQaBindings(target.instance, spawnSync)
    const statements = rows.map(([table, body]) => {
      if (!['jobs', 'kael_job_incidents', 'scope_change_requests', 'worker_profiles', 'price_baselines', 'source_trust_registry'].includes(table)) throw new Error('QA fixture table refused')
      const columns = Object.keys(body)
      if (!columns.length || columns.some(key => !/^[a-z_]+$/u.test(key))) throw new Error('QA fixture columns refused')
      const names = columns.map(key => `"${key}"`).join(',')
      const delimiter = `$qa_${randomUUID().replaceAll('-', '')}$`
      const json = JSON.stringify(body)
      if (json.includes(delimiter)) throw new Error('QA fixture delimiter refused')
      return `insert into public.${table} (${names}) select ${names} from jsonb_populate_record(null::public.${table}, ${delimiter}${json}${delimiter}::jsonb);`
    })
    // Incident tables deliberately expose mutation RPCs instead of direct REST inserts.
    const result = spawnSync('docker', ['exec', '-i', `supabase_db_nestscout-qa-${target.instance}`,
      'psql', '-Xq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-U', 'postgres', '-d', 'postgres'], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true,
      input: `begin;\n${statements.join('\n')}\ncommit;\n`,
    })
    if (result.error || result.status !== 0) {
      const code = /ERROR:\s+([0-9A-Z]{5})/u.exec(result.stderr ?? '')?.[1] ?? 'fixture_failed'
      throw new Error(pillarWhy(pillar, `local SQL fixture failed; code=${code}`))
    }
  }
  return { target, request, customer, seedRows }
}
