/**
 * D4 column-drift snapshot — real Supabase staging.
 *
 * The overview views list columns explicitly (never `select *`) so a new source column
 * cannot auto-leak through PostgREST. The cost of explicit listing is the opposite failure:
 * the view silently goes STALE when a source table gains a column nobody wired in. This test
 * freezes the exact column set of the four P3a objects (migration 20260619151536) so drift in
 * either direction stops and forces a human decision:
 *   - a column present in the DB but not in EXPECTED  -> LEAK  (fail)
 *   - a column in EXPECTED but not in the DB          -> STALE (fail)
 *
 * Columns are read from the PostgREST OpenAPI root (GET /rest/v1/), which lists the exact
 * column surface each object exposes over the API — the thing that would leak. That surface is
 * row-independent and, unlike a direct select, is listed even for the security_invoker views
 * that are granted to authenticated rather than service_role. information_schema is not usable
 * here: PostgREST does not expose that schema.
 *
 * Env-gated via the same pattern as rls-per-actor: skips without staging creds, refuses
 * production. IMPORTANT: because it skips without creds, a green CI run does NOT prove this
 * test executed — only a local run against staging does. See docs/test-logs for that evidence.
 *
 * Requires .env.local at repo root with:
 *   NEXT_PUBLIC_SUPABASE_URL (staging), SUPABASE_SERVICE_ROLE_KEY
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(__dirname, '../../../../../.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...valueParts] = trimmed.split('=')
      if (!key || valueParts.length === 0) continue
      vars[key.trim()] = valueParts.join('=').trim()
    }
    return vars
  } catch {
    return {}
  }
}

const envVars = loadEnvFile()
const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY

const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const isProduction = supabaseUrl?.includes(PRODUCTION_REF) ?? false
const skip = !supabaseUrl || !serviceRoleKey || isProduction
const describeReal = skip ? describe.skip : describe

if (isProduction) {
  console.warn('[actor-stats-column-drift] Refusing to run against production. Point NEXT_PUBLIC_SUPABASE_URL at staging.')
}

// Frozen from the staging schema created by migration 20260619151536_worker_customer_stats.
// A source table gaining a column, or a view exposing a new one, breaks this on purpose — the
// fix is a human deciding whether the column belongs, then updating this list, not loosening
// the test.
const EXPECTED: Record<string, string[]> = {
  worker_stats: [
    'worker_id', 'completion_rate', 'on_time_rate', 'avg_response_time_min',
    'income_30d', 'jobs_30d', 'total_income', 'cancel_rate', 'last_recomputed_at',
  ],
  customer_stats: [
    'customer_id', 'bookings_total', 'bookings_30d', 'total_spent',
    'dispute_free_rate', 'last_recomputed_at',
  ],
  worker_overview: [
    'worker_id', 'legal_name', 'rating', 'total_jobs', 'is_approved', 'is_available',
    'verification_status', 'service_types', 'districts', 'completion_rate', 'on_time_rate',
    'avg_response_time_min', 'income_30d', 'jobs_30d', 'total_income', 'cancel_rate',
    'last_recomputed_at',
  ],
  customer_overview: [
    'customer_id', 'building_name', 'unit_number', 'district', 'created_at',
    'bookings_total', 'bookings_30d', 'total_spent', 'dispute_free_rate', 'last_recomputed_at',
  ],
}

describeReal('D4 column drift — actor stats tables + overview views (P3a)', () => {
  let definitions: Record<string, { properties?: Record<string, unknown> }> = {}

  beforeAll(async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` },
    })
    if (!res.ok) throw new Error(`PostgREST OpenAPI root returned ${res.status}`)
    const body = (await res.json()) as { definitions?: typeof definitions }
    definitions = body.definitions ?? {}
  })

  function liveColumns(object: string): string[] {
    const def = definitions[object]
    if (!def) throw new Error(`${object}: not present in the PostgREST OpenAPI surface`)
    return Object.keys(def.properties ?? {}).sort()
  }

  for (const [object, expected] of Object.entries(EXPECTED)) {
    it(`${object} exposes exactly its frozen column set (no leak, no stale)`, () => {
      const actual = liveColumns(object)
      const want = [...expected].sort()
      const leaked = actual.filter((c) => !want.includes(c))
      const missing = want.filter((c) => !actual.includes(c))
      expect({ object, leaked, missing }).toEqual({ object, leaked: [], missing: [] })
      expect(actual).toEqual(want)
    })
  }
})
