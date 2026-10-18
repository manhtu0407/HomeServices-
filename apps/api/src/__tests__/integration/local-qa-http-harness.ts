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
    method?: string; token?: string; key?: string; body?: unknown; compatible?: boolean; maintainerSecret?: string
  } = {}) {
    if (!target) throw new Error(pillarWhy(pillar, 'named target absent'))
    const url = new URL(path, target.url)
    if (url.origin !== target.url) throw new Error(pillarWhy(pillar, 'cross-origin QA request refused'))
    if (options.maintainerSecret && (url.pathname !== '/functions/v1/kael-matching-maintainer' || options.method !== 'POST')) {
      throw new Error(pillarWhy(pillar, 'maintainer credential destination refused'))
    }
    const startedAt = Date.now()
    const response = await fetch(url, {
      method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: options.key ?? target.serviceRoleKey ?? '',
        authorization: `Bearer ${options.token ?? target.serviceRoleKey ?? ''}`,
        'content-type': 'application/json',
        ...(options.maintainerSecret ? { 'x-kael-matching-maintainer-secret': options.maintainerSecret } : {}),
        ...(options.compatible === false ? {} : {
          origin: 'http://localhost:8086', 'x-client-platform': 'web-preview',
          'x-client-contract-epoch': '2',
          'x-client-application-id': 'com.phanmanhtu.nestscout.web-preview',
        }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }).catch(error => {
      throw new Error(pillarWhy(pillar, `${options.method ?? 'GET'} ${url.pathname} failed after ${Date.now() - startedAt}ms`), { cause: error })
    })
    const body = await response.text()
    const payload: unknown = body ? JSON.parse(body) : null
    return {
      status: response.status, payload, runId: response.headers.get('x-run-id'),
      fixtureProviderCalls: response.headers.has('x-qa-provider-fixture-calls') ? Number(response.headers.get('x-qa-provider-fixture-calls')) : null,
      fixtureDeniedCalls: response.headers.has('x-qa-denied-calls') ? Number(response.headers.get('x-qa-denied-calls')) : null,
    }
  }
  async function customer(role: 'customer' | 'worker' | 'admin' = 'customer'): Promise<LocalQaActor> {
    const email = `qa-http-${randomUUID()}@example.test`
    const password = `Qa!${randomBytes(24).toString('hex')}`
    const created = await request('/auth/v1/admin/users', {
      method: 'POST', body: { email, password, email_confirm: true, user_metadata: { full_name: 'QA HTTP fixture' } },
    })
    if (created.status !== 200) throw new Error(pillarWhy(pillar, 'local Auth fixture creation failed'))
    const id = requiredText(localQaRecord(created.payload).id)
    if (role !== 'customer') {
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
      if (!['jobs', 'kael_job_incidents', 'scope_change_requests', 'worker_profiles', 'price_baselines', 'source_trust_registry',
        'kael_chat_sessions', 'kael_chat_turns', 'confirmation_operations', 'matching_operations', 'matching_capacity_reservations'].includes(table)) throw new Error('QA fixture table refused')
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
  function confirmationFailureCount(runId: string): number {
    if (!target || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) throw new Error('QA trace identifier refused')
    assertLocalQaBindings(target.instance, spawnSync)
    const result = spawnSync('docker', ['exec', '-i', `supabase_db_nestscout-qa-${target.instance}`,
      'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true,
      input: `select count(*) from public.harness_events where run_id='${runId}'::uuid and event_class='kael.confirm.rpc_failed';`,
    })
    if (result.error || result.status !== 0 || !/^\d+$/u.test(result.stdout.trim())) throw new Error('QA trace count unavailable')
    return Number(result.stdout.trim())
  }
  async function dispatchMatching() {
    if (!target) throw new Error(pillarWhy(pillar, 'named target absent'))
    assertLocalQaBindings(target.instance, spawnSync)
    const secret = spawnSync('docker', ['exec', '-i', `supabase_db_nestscout-qa-${target.instance}`,
      'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true,
      input: "select decrypted_secret from vault.decrypted_secrets where name='kael_matching_maintainer_secret';",
    })
    if (secret.error || secret.status !== 0 || !/^[0-9a-f]{64}$/u.test(secret.stdout.trim())) {
      throw new Error(pillarWhy(pillar, 'local maintainer credential unavailable'))
    }
    return request('/functions/v1/kael-matching-maintainer', {
      method: 'POST', body: {}, maintainerSecret: secret.stdout.trim(),
    })
  }
  return { target, request, customer, seedRows, confirmationFailureCount, dispatchMatching }
}
