import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const listFilesUnder = (relDir: string): string[] =>
  readdirSync(resolve(ROOT, relDir), { withFileTypes: true }).flatMap((entry) => {
    const relPath = `${relDir}/${entry.name}`
    return entry.isDirectory() ? listFilesUnder(relPath) : [relPath]
  })
const readMobileApiTypesLayer = () =>
  [
    read('apps/mobile/lib/api-types.ts'),
    ...listFilesUnder('apps/mobile/lib/api-types')
      .filter((relPath) => relPath.endsWith('.ts'))
      .sort()
      .map(read),
  ].join('\n')
const migrations = () => readdirSync(resolve(ROOT, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(`supabase/migrations/${name}`))
  .join('\n')

describe('Plan §31 B4 knowledge governance', () => {
  it('adds service-role RPC governance for approved LS5 and LS6 knowledge candidates', () => {
    const sql = read('supabase/migrations/20260604210000_kael_b4_knowledge_governance.sql')

    expect(sql).toContain('create or replace function public.apply_approved_learning_candidate_to_knowledge')
    expect(sql).toContain("v_candidate.candidate_type = 'service_knowledge_candidate'")
    expect(sql).toContain('insert into public.service_knowledge_boxes')
    expect(sql).toContain('on conflict (service_type) do update')
    expect(sql).toContain("v_candidate.candidate_type = 'safety_pattern_candidate'")
    expect(sql).toContain('insert into public.worker_safety_patterns')
    expect(sql).toContain('on conflict (pattern_key) do update')
    expect(sql).toContain('admin_approved_knowledge_upsert')
    expect(sql).toContain('knowledge_version')
    expect(sql).toContain('knowledge_upsert_missing')
    expect(sql).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
  })

  it('keeps Edge admin approval as the only writer path for knowledge candidate apply', () => {
    const services = read('supabase/functions/mobile-api/_shared/domains.ts') + read('supabase/functions/mobile-api/_shared/domains/admin/learning.ts')
    const responseContract = read('supabase/functions/mobile-api/_shared/domains/contracts/admin-learning.ts')
    const mobileTypes = readMobileApiTypesLayer()

    expect(services).toContain('admin_review_and_approve_learning_candidate_atomic')
    expect(services).not.toContain('rpc("apply_approved_learning_candidate_to_knowledge"')
    expect(services).toContain('knowledge_apply')
    expect(responseContract).toContain('knowledge_apply')
    expect(mobileTypes).toContain('knowledge_apply')
    expect(services).not.toContain('.from("worker_safety_patterns").insert')
    expect(services).not.toContain('.from("service_knowledge_boxes").insert')
  })

  it('commits manual approval and knowledge application through one retry-safe RPC', () => {
    const sql = read('supabase/migrations/20260715114000_atomic_learning_admin_approval.sql')

    expect(sql).toContain('create or replace function public.admin_approve_learning_candidate_atomic')
    expect(sql).toContain('for update')
    expect(sql).toMatch(
      /version\.change_reason\s*=\s*'admin_approve_learning_candidate:'\s*\|\|\s*p_candidate_id::text/,
    )
    expect(sql).toContain("lifecycle.transition_reason = 'admin_approved_knowledge_upsert'")
    expect(sql).toContain('public.apply_approved_learning_candidate_to_knowledge')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('grant execute on function public.admin_approve_learning_candidate_atomic')
  })

  it('preserves B1 retrieval tables while B4 governance migration is present', () => {
    const allSql = migrations()
    const knowledge = read('supabase/functions/mobile-api/_shared/kael/tools/knowledge.ts')

    expect(allSql).toContain('20260604210000')
    expect(allSql).toContain('grant execute on function public.apply_approved_learning_candidate_to_knowledge')
    expect(knowledge).toContain('service_knowledge_boxes')
    expect(knowledge).toContain('worker_safety_patterns')
    expect(knowledge).toContain('legal_awareness_patterns')
  })
})
