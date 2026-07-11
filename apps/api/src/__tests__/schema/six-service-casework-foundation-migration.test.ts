import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations')
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_six_service_casework_foundation.sql'),
)

if (!migrationName) {
  throw new Error('six-service case-work foundation migration is missing')
}

const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8')
const verificationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/tests/six_service_casework_foundation_verification.sql',
  ),
  'utf8',
)

describe('six-service case-work data foundation migration', () => {
  it('extends service and workflow enums without seeding invented prices', () => {
    for (const service of ['hvac', 'upholstery', 'handyman']) {
      expect(sql).toContain(
        `alter type public.service_type add value if not exists '${service}'`,
      )
    }
    expect(sql).toMatch(
      /alter type public\.job_status\s+add value if not exists 'worker_candidate_pending' after 'broadcasting'/i,
    )
    expect(sql).not.toMatch(/insert\s+into\s+public\.price_baselines/i)
    expect(sql).not.toMatch(/\b(price_min|price_max|final_price)\b/i)
  })

  it('records one active worker candidate per job without assigning jobs.worker_id early', () => {
    expect(sql).toContain('create table public.job_worker_candidates')
    expect(sql).toMatch(
      /job_id\s+uuid\s+not null\s+references\s+public\.jobs\(id\)\s+on delete cascade/i,
    )
    expect(sql).toMatch(
      /worker_id\s+uuid\s+not null\s+references\s+public\.worker_profiles\(id\)\s+on delete cascade/i,
    )
    expect(sql).toMatch(
      /broadcast_id\s+uuid\s+references\s+public\.job_broadcasts\(id\)\s+on delete set null/i,
    )
    expect(sql).toMatch(
      /status\s+text\s+not null\s+default\s+'proposed'[\s\S]*check\s*\(status\s+in\s*\([\s\S]*'customer_confirmed'[\s\S]*'customer_declined'[\s\S]*'expired'[\s\S]*'withdrawn'/i,
    )
    expect(sql).toMatch(
      /create unique index job_worker_candidates_one_active_per_job_idx[\s\S]*where status = 'proposed'/i,
    )
    expect(sql).not.toMatch(/where status in \('proposed', 'customer_confirmed'\)/i)
    expect(sql).not.toMatch(/update\s+public\.jobs[\s\S]*set\s+worker_id/i)
  })

  it('stores customer-owned favorite workers with relational role guards', () => {
    expect(sql).toContain('create table public.customer_favorite_workers')
    expect(sql).toMatch(
      /customer_id\s+uuid\s+not null\s+references\s+public\.customer_profiles\(id\)\s+on delete cascade/i,
    )
    expect(sql).toMatch(
      /worker_id\s+uuid\s+not null\s+references\s+public\.worker_profiles\(id\)\s+on delete cascade/i,
    )
    expect(sql).toMatch(/primary key\s*\(customer_id, worker_id\)/i)
    expect(sql).toMatch(/check\s*\(customer_id\s*<>\s*worker_id\)/i)
  })

  it('enables RLS and exposes only the least Data API privileges', () => {
    for (const table of ['job_worker_candidates', 'customer_favorite_workers']) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      )
      expect(sql).toContain(`revoke all on public.${table} from public, anon`)
      expect(sql).toContain(
        `grant select, insert, update, delete on public.${table} to service_role`,
      )
    }

    expect(sql).toContain('grant select on public.job_worker_candidates to authenticated')
    expect(sql).toContain(
      'revoke insert, update, delete on public.job_worker_candidates from authenticated',
    )
    expect(sql).toMatch(
      /create policy "Customers read own worker candidates"[\s\S]*j\.customer_id = \(select auth\.uid\(\)\)/i,
    )
    expect(sql).toMatch(
      /create policy "Workers read own candidacies"[\s\S]*worker_id = \(select auth\.uid\(\)\)/i,
    )

    expect(sql).toContain(
      'grant select, insert, delete on public.customer_favorite_workers to authenticated',
    )
    expect(sql).toContain(
      'revoke update on public.customer_favorite_workers from authenticated',
    )
    expect(sql).toMatch(
      /create policy "Customers save own favorite workers"[\s\S]*with check \(customer_id = \(select auth\.uid\(\)\)\)/i,
    )
    expect(sql).toMatch(
      /create policy "Customers remove own favorite workers"[\s\S]*using \(customer_id = \(select auth\.uid\(\)\)\)/i,
    )
  })

  it('ships rollback-only positive and negative actor verification', () => {
    expect(verificationSql.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(verificationSql).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(verificationSql).toContain("set local role authenticated")
    for (const actor of [
      'a1100000-0000-4000-8000-000000000001',
      'a1100000-0000-4000-8000-000000000002',
      'a1100000-0000-4000-8000-000000000003',
      'a1100000-0000-4000-8000-000000000004',
    ]) {
      expect(verificationSql).toContain(actor)
    }
    expect(verificationSql).toContain(
      'other customer read a worker candidate outside their job',
    )
    expect(verificationSql).toContain(
      'other customer wrote a private favorite-worker relation',
    )
    expect(verificationSql).toContain(
      'authenticated can update server-owned worker candidates',
    )
    expect(verificationSql).toContain('second active candidate unexpectedly succeeded')
  })
})
