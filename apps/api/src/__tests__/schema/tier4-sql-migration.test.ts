import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations')
const SQL = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8'))
  .join('\n')

const ALIGNMENT_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, '20260513114845_align_structures_workflow.sql'),
  'utf-8'
)

const FUNCTION_HARDENING_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, '20260513125704_harden_function_execution.sql'),
  'utf-8'
)

const RLS_AUTO_ENABLE_REVOKE_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, '20260513131949_revoke_rls_auto_enable_rpc.sql'),
  'utf-8'
)
const CATALOG_LABEL_FIX_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, '20260519145538_fix_vietnamese_catalog_labels.sql'),
  'utf-8'
)
const FUNCTION_SEARCH_PATH_PATTERNS = [
  /alter\s+function\s+public\.update_updated_at\(\)\s+set\s+search_path\s*=\s*public/i,
  /alter\s+function\s+public\.update_worker_rating\(\)\s+set\s+search_path\s*=\s*public/i,
  /alter\s+function\s+public\.handle_new_user\(\)\s+set\s+search_path\s*=\s*public/i,
]

describe('Workflow alignment migration exists', () => {
  it('renames legacy job_status before creating the new enum', () => {
    expect(ALIGNMENT_SQL).toMatch(/alter\s+type\s+job_status\s+rename\s+to\s+job_status_legacy/i)
    expect(ALIGNMENT_SQL).toMatch(/create\s+type\s+job_status\s+as\s+enum/i)
    expect(ALIGNMENT_SQL).toMatch(/drop\s+type\s+job_status_legacy/i)
  })

  it('maps legacy states to the new workflow explicitly', () => {
    for (const [legacy, next] of [
      ['pending', 'analyzing'],
      ['broadcast', 'broadcasting'],
      ['matched', 'worker_matched'],
      ['worker_en_route', 'worker_on_way'],
      ['in_progress', 'repairing'],
      ['scope_change', 'scope_change_pending'],
      ['completed', 'completed_by_worker'],
      ['confirmed', 'confirmed_by_customer'],
    ]) {
      expect(ALIGNMENT_SQL).toContain(`when '${legacy}' then '${next}'`)
    }
  })
})

describe('All public tables have RLS enabled', () => {
  const TABLES = [
    'profiles',
    'customer_profiles',
    'worker_profiles',
    'service_categories',
    'service_problems',
    'price_baselines',
    'jobs',
    'job_broadcasts',
    'job_events',
    'chat_messages',
    'scope_change_requests',
    'notifications',
    'reviews',
    'api_logs',
    'learning_candidates',
    'learning_rules',
    'learning_rule_versions',
  ]

  it.each(TABLES)('"%s" has row level security enabled', (table) => {
    const pattern = new RegExp(
      `alter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security`,
      'i'
    )
    expect(SQL).toMatch(pattern)
  })
})

describe('New schema objects exist', () => {
  it.each([
    'service_categories',
    'service_problems',
    'job_events',
    'scope_change_requests',
    'notifications',
    'learning_candidates',
    'learning_rules',
    'learning_rule_versions',
  ])('creates "%s"', (table) => {
    expect(ALIGNMENT_SQL).toMatch(new RegExp(`create\\s+table\\s+${table}`, 'i'))
  })

  it('adds price baseline problem/district uniqueness', () => {
    expect(ALIGNMENT_SQL).toMatch(/price_baselines_problem_district_complexity_key/i)
    expect(ALIGNMENT_SQL).toMatch(/unique\s*\(\s*service_problem_id\s*,\s*district_code\s*,\s*complexity\s*\)/i)
  })

  it('extends api_logs without storing raw prompts', () => {
    expect(ALIGNMENT_SQL).toContain('safe_metadata jsonb')
    expect(ALIGNMENT_SQL).toContain('fallback_used boolean')
    expect(ALIGNMENT_SQL).not.toMatch(/prompt\s+text/i)
  })
})

describe('RLS policy hardening', () => {
  it('uses private.is_admin instead of public is_admin', () => {
    expect(ALIGNMENT_SQL).toMatch(/create\s+schema\s+if\s+not\s+exists\s+private/i)
    expect(ALIGNMENT_SQL).toMatch(/function\s+private\.is_admin/i)
    expect(ALIGNMENT_SQL).toContain('drop function if exists is_admin()')
  })

  it('does not keep broad profile or worker-profile self-update policies', () => {
    expect(ALIGNMENT_SQL).toContain('drop policy if exists "Users update own profile"')
    expect(ALIGNMENT_SQL).toContain('drop policy if exists "Workers manage own worker profile"')
    expect(ALIGNMENT_SQL).not.toMatch(/create\s+policy\s+"Users update own profile"/i)
    expect(ALIGNMENT_SQL).not.toMatch(/create\s+policy\s+"Workers manage own worker profile"/i)
  })

  it('does not expose approved worker private profile rows to customers', () => {
    expect(ALIGNMENT_SQL).toContain('drop policy if exists "Customers view approved worker profiles"')
    expect(ALIGNMENT_SQL).not.toMatch(/create\s+policy\s+"Customers view approved worker profiles"/i)
  })

  it('participants can read jobs but normal users cannot mutate workflow state directly', () => {
    expect(ALIGNMENT_SQL).toMatch(/create\s+policy\s+"Participants read jobs"/i)
    expect(ALIGNMENT_SQL).not.toMatch(/create\s+policy\s+"Customers update own jobs"/i)
    expect(ALIGNMENT_SQL).not.toMatch(/create\s+policy\s+"Workers update assigned jobs"/i)
  })
})

describe('Function execution hardening migration', () => {
  it('pins search_path on trigger/helper functions flagged by Supabase advisors', () => {
    for (const pattern of FUNCTION_SEARCH_PATH_PATTERNS) {
      expect(FUNCTION_HARDENING_SQL).toMatch(pattern)
    }
  })

  it('prevents API roles from calling trigger-only handle_new_user directly', () => {
    expect(FUNCTION_HARDENING_SQL).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+from\s+public/i
    )
    expect(FUNCTION_HARDENING_SQL).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+from\s+anon/i
    )
    expect(FUNCTION_HARDENING_SQL).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+from\s+authenticated/i
    )
  })
})

describe('Production-only rls_auto_enable RPC hardening migration', () => {
  it('is conditional so staging and fresh environments do not fail when the function is absent', () => {
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(/do\s+\$\$/i)
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(/if\s+exists\s*\(/i)
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(/p\.proname\s*=\s*'rls_auto_enable'/i)
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(/pg_get_function_identity_arguments\(p\.oid\)\s*=\s*''/i)
  })

  it('revokes direct RPC execution from exposed API roles without dropping the helper', () => {
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.rls_auto_enable\(\)\s+from\s+public/i
    )
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.rls_auto_enable\(\)\s+from\s+anon/i
    )
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.rls_auto_enable\(\)\s+from\s+authenticated/i
    )
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).not.toMatch(/drop\s+function/i)
    expect(RLS_AUTO_ENABLE_REVOKE_SQL).not.toMatch(/drop\s+event\s+trigger/i)
  })
})

describe('Storage policies are scoped by job or worker path', () => {
  it('drops broad authenticated media policies', () => {
    expect(ALIGNMENT_SQL).toContain('drop policy if exists "Authenticated users upload job photos"')
    expect(ALIGNMENT_SQL).toContain('drop policy if exists "Authenticated users view completion photos"')
  })

  it('job photos require participant access to folder job id', () => {
    expect(ALIGNMENT_SQL).toMatch(/bucket_id\s*=\s*'job-photos'/)
    expect(ALIGNMENT_SQL).toMatch(/private\.is_job_participant\(\(storage\.foldername\(name\)\)\[1\]::uuid\)/)
  })

  it('completion uploads require the matched worker', () => {
    expect(ALIGNMENT_SQL).toMatch(/bucket_id\s*=\s*'completion-photos'/)
    expect(ALIGNMENT_SQL).toMatch(/private\.is_job_worker\(\(storage\.foldername\(name\)\)\[1\]::uuid\)/)
  })

  it('worker documents remain worker-owned with admin read path', () => {
    expect(ALIGNMENT_SQL).toMatch(/bucket_id\s*=\s*'worker-documents'/)
    expect(ALIGNMENT_SQL).toMatch(/private\.is_admin\(\)/)
  })
})

describe('Data API grants are explicit', () => {
  it('grants public schema usage and table access to authenticated role', () => {
    expect(ALIGNMENT_SQL).toMatch(/grant\s+usage\s+on\s+schema\s+public\s+to\s+authenticated/i)
    expect(ALIGNMENT_SQL).toMatch(/grant\s+select\s+on[\s\S]*service_categories[\s\S]*to\s+authenticated/i)
  })
})

describe('Catalog labels are Vietnamese-first', () => {
  it('patches the three active service and box labels with Vietnamese accents', () => {
    for (const label of ['Sửa điện', 'Sửa nước', 'Vệ sinh/dọn dẹp']) {
      expect(CATALOG_LABEL_FIX_SQL).toContain(label)
    }
  })

  it('patches cleaning problem labels because cleaning was added after the original seed', () => {
    for (const label of ['Dọn dẹp nhà', 'Vệ sinh bếp', 'Vệ sinh phòng tắm', 'Tổng vệ sinh']) {
      expect(CATALOG_LABEL_FIX_SQL).toContain(label)
    }
  })
})

describe('No hardcoded secrets or unsafe PII in migrations', () => {
  it('has no AI or Supabase management token patterns', () => {
    expect(SQL).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(SQL).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
    expect(SQL).not.toMatch(/sbp_[A-Za-z0-9]{32,}/)
  })

  it('does not reference process.env inside SQL', () => {
    expect(SQL).not.toContain('process.env')
  })

  it('does not hardcode user emails or Vietnamese phone numbers', () => {
    expect(SQL).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    expect(SQL).not.toMatch(/\+84\d{9,10}/)
    expect(SQL).not.toMatch(/09\d{8}/)
  })
})
