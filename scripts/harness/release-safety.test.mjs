import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertConsecutiveSyntheticSmokes,
  assertReleaseTarget,
  auditExpandOnlyMigration,
  buildReleaseFailureReceipt,
  pendingMigrationEntries,
  syntheticCohortId,
} from './release-safety.mjs'
import { buildExpandOnlyReceipt } from './assert-expand-only.mjs'

test('release target requires the exact registered production project and origin', () => {
  assert.deepEqual(assertReleaseTarget({
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
  }), {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
  })
  assert.throws(() => assertReleaseTarget({
    environment: 'production',
    projectRef: 'xyylanuyflrjzbjzhqfl',
    projectUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
  }), /registered release target/u)
  assert.throws(() => assertReleaseTarget({
    environment: 'staging',
    projectRef: 'xyylanuyflrjzbjzhqfl',
    projectUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
  }), /Staging and Preview targets are locked/u)
})

test('pending migrations reject unknown history and accept only registered semantic aliases', () => {
  const inventory = {
    migrationEquivalences: { version: '1.0.0', groups: [] },
    entries: [
      { version: '20260801000000', file: 'supabase/migrations/20260801000000_a.sql' },
      { version: '20260802000000', file: 'supabase/migrations/20260802000000_b.sql' },
      { version: '20260803000000', file: 'supabase/migrations/20260803000000_c.sql' },
    ],
  }
  assert.deepEqual(
    pendingMigrationEntries(inventory, [{ version: '20260801000000' }, { version: '20260802000000' }]),
    [inventory.entries[2]],
  )
  assert.throws(
    () => pendingMigrationEntries(inventory, [{ version: '20260801000000' }, { version: '20260804000000' }]),
    /unknown versions/u,
  )
})

test('one exact remote hotfix alias satisfies its canonical migration without replay', () => {
  const inventory = {
    migrationEquivalences: {
      version: '1.0.0',
      groups: [{
        id: 'fixture-hotfix',
        canonicalVersion: '20260803000000',
        versions: ['20260801000000', '20260802000000', '20260803000000'],
        semanticSha256: 'a'.repeat(64),
      }],
    },
    entries: [
      { version: '20260801000000', file: 'alias-a.sql' },
      { version: '20260802000000', file: 'alias-b.sql' },
      { version: '20260803000000', file: 'canonical.sql' },
      { version: '20260804000000', file: 'next.sql' },
    ],
  }
  assert.deepEqual(
    pendingMigrationEntries(inventory, [{ version: '20260802000000' }]),
    [inventory.entries[3]],
  )
  assert.throws(
    () => pendingMigrationEntries(inventory, [
      { version: '20260801000000' }, { version: '20260802000000' },
    ]),
    /multiple equivalent versions/u,
  )
})

test('expand-only audit accepts additive DDL and the exact cohort-scoped cleanup allowlist', () => {
  const sql = `
    begin;
    alter table public.jobs add column if not exists synthetic_cohort_id text;
    create table if not exists public.outbox (id uuid primary key);
    create or replace function public.cleanup_synthetic_matching_cohort(p_cohort_id text)
    returns void language plpgsql as $$
    begin
      delete from public.jobs where synthetic_cohort_id = p_cohort_id;
    end;
    $$;
    commit;
  `
  assert.deepEqual(auditExpandOnlyMigration(sql), [])
})

test('expand-only audit rejects destructive top-level schema and data changes', () => {
  const problems = auditExpandOnlyMigration(`
    alter table public.jobs drop column final_price;
    truncate table public.jobs;
    delete from public.jobs;
  `)
  assert.equal(problems.length, 3)
  assert.match(problems.join('\n'), /DROP COLUMN/u)
  assert.match(problems.join('\n'), /TRUNCATE/u)
  assert.match(problems.join('\n'), /DELETE FROM/u)
})

test('expand-only audit rejects trigger/policy replacement by drop and destructive stored SQL', () => {
  const problems = auditExpandOnlyMigration(`
    drop trigger if exists unsafe_trigger on public.jobs;
    drop policy if exists "unsafe policy" on public.jobs;
    create or replace function public.cleanup_everything(p_cohort_id text)
    returns void language plpgsql as $fn$
    begin
      delete from public.jobs where synthetic_cohort_id = p_cohort_id;
      truncate table public.job_broadcasts;
    end;
    $fn$;
    create or replace function public.cleanup_synthetic_matching_cohort(p_cohort_id text)
    returns void language plpgsql as $$
    begin
      delete from public.jobs where synthetic_cohort_id = p_cohort_id or true;
    end;
    $$;
  `)
  assert.equal(problems.filter((problem) => problem.includes('DROP OBJECT')).length, 2)
  assert.match(problems.join('\n'), /DELETE FROM in stored SQL/u)
  assert.match(problems.join('\n'), /TRUNCATE in stored SQL/u)
})

test('expand-only audit accepts an exact absent trigger proof only when the migration recreates it', () => {
  const sql = `
    drop trigger if exists jobs_project_official_match_operations on public.jobs;
    create trigger jobs_project_official_match_operations
    after update on public.jobs
    for each row execute function private.project_official_match_operations();
  `
  const absent = [{
    object_kind: 'trigger',
    schema_name: 'public',
    relation_name: 'jobs',
    object_name: 'jobs_project_official_match_operations',
    exists: false,
  }]
  assert.deepEqual(auditExpandOnlyMigration(sql, { migrationObjectPreconditions: absent }), [])
  assert.match(auditExpandOnlyMigration(sql, {
    migrationObjectPreconditions: [{ ...absent[0], exists: true }],
  }).join('\n'), /DROP OBJECT/u)
  assert.match(auditExpandOnlyMigration(
    'drop trigger if exists jobs_project_official_match_operations on public.jobs;',
    { migrationObjectPreconditions: absent },
  ).join('\n'), /DROP OBJECT/u)
})

test('expand-only audit accepts only a hosted-proven strict CHECK relaxation', () => {
  const sql = `
    alter table public.jobs
      drop constraint if exists jobs_payment_status_check;
    alter table public.jobs
      add constraint jobs_payment_status_check
      check (payment_status in ('pending', 'received', 'direct_paid'));
  `
  const proof = [{
    object_kind: 'constraint',
    schema_name: 'public',
    relation_name: 'jobs',
    object_name: 'jobs_payment_status_check',
    exists: true,
    definition: "CHECK (payment_status = ANY (ARRAY['pending'::text, 'received'::text]))",
  }]
  assert.deepEqual(auditExpandOnlyMigration(sql, { migrationObjectPreconditions: proof }), [])
  assert.match(auditExpandOnlyMigration(sql).join('\n'), /DROP CONSTRAINT/u)
  assert.match(auditExpandOnlyMigration(sql.replace("'received', 'direct_paid'", "'failed'"), {
    migrationObjectPreconditions: proof,
  }).join('\n'), /DROP CONSTRAINT/u)
  assert.match(auditExpandOnlyMigration(sql.replace('jobs_payment_status_check\n      check', 'other_check\n      check'), {
    migrationObjectPreconditions: proof,
  }).join('\n'), /DROP CONSTRAINT/u)
})

test('expand-only receipt binds the exact target, hosted watermark, and SQL bytes', () => {
  const receipt = buildExpandOnlyReceipt({
    environment: 'production',
    hostedMigrations: [],
    inventory: {
      migrationEquivalences: { version: '1.0.0', groups: [] },
      entries: [{
        file: 'scripts/harness/fixtures/additive-migration.sql',
        version: '20260823000000',
      }],
    },
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    migrationObjectPreconditions: [{
      object_kind: 'trigger',
      schema_name: 'public',
      relation_name: 'jobs',
      object_name: 'jobs_project_official_match_operations',
      exists: false,
    }],
    root: fileURLToPath(new URL('../..', import.meta.url)),
  })
  assert.equal(receipt.pendingMigrations.length, 1)
  assert.equal(receipt.pendingWatermark, '20260823000000')
  assert.equal(receipt.schemaVersion, '1.2.0')
  assert.equal(receipt.migrationObjectPreconditions.length, 1)
  assert.match(receipt.auditSha256, /^[0-9a-f]{64}$/u)
})

test('synthetic cohort and smoke acceptance are release-bound and three-run strict', () => {
  const releaseId = 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb'
  const cohort = syntheticCohortId(releaseId, 918273)
  assert.match(cohort, /^synthetic-stage1-aaaaaaaaaaaa-bbbbbbbbbbbb-918273$/u)
  const runs = [1, 2, 3].map((sequence) => ({
    cohortId: cohort,
    releaseId,
    sequence,
    scenarios: { autoQuote: true, recovery: true, rfqOrInspection: true },
    syntheticLeakCount: 0,
  }))
  assert.deepEqual(assertConsecutiveSyntheticSmokes({ cohortId: cohort, releaseId, runs }), runs)
  assert.throws(
    () => assertConsecutiveSyntheticSmokes({ cohortId: cohort, releaseId, runs: runs.slice(0, 2) }),
    /exactly three/u,
  )
})

test('failure receipt is safe, immutable-release-bound, and checksummed', () => {
  const receipt = buildReleaseFailureReceipt({
    cohortId: 'synthetic-stage1-aaaaaaaaaaaa-bbbbbbbbbbbb-918273',
    now: '2026-08-23T10:00:00.000Z',
    phase: 'production_canary',
    reasonCode: 'SYNTHETIC_SMOKE_FAILED',
    release: {
      bundleSha256: 'c'.repeat(64),
      gitSha: 'd'.repeat(40),
      releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    },
    runId: '918273',
  })
  assert.equal(receipt.status, 'aborted')
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u)
  assert.equal(JSON.stringify(receipt).includes('token'), false)
})

test('Plan 55 failure receipts accept only a bounded synthetic Plan 55 cohort', () => {
  const release = {
    bundleSha256: 'c'.repeat(64),
    gitSha: 'd'.repeat(40),
    releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    releaseLane: 'plan55-production-only',
  }
  const receipt = buildReleaseFailureReceipt({
    cohortId: 'synthetic-plan55-0123456789abcdef0123456789abcdef',
    now: '2026-08-23T10:00:00.000Z',
    phase: 'paired_wave_1',
    reasonCode: 'PAIR_ABORTED',
    release,
    runId: 'plan55-wave-1',
  })

  assert.equal(receipt.status, 'aborted')
  assert.equal(receipt.cohortId, 'synthetic-plan55-0123456789abcdef0123456789abcdef')
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u)
  assert.throws(() => buildReleaseFailureReceipt({
    cohortId: 'synthetic-stage1-aaaaaaaaaaaa-bbbbbbbbbbbb-run',
    phase: 'paired_wave_1',
    reasonCode: 'PAIR_ABORTED',
    release,
    runId: 'plan55-wave-1',
  }), /failure receipt cohort/u)
  assert.throws(() => buildReleaseFailureReceipt({
    phase: 'paired_wave_1',
    reasonCode: 'PAIR_ABORTED',
    release,
    runId: 'plan55-wave-1',
  }), /failure receipt cohort/u)
})
