import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { buildAccessMatrix, checkAccessMatrix } from './access-matrix.mjs'

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeScenarios(root) {
  const actors = ['anonymous', 'customer_a', 'customer_b', 'worker_a', 'worker_b', 'admin', 'service_role']
  const surfaces = ['table', 'rpc', 'storage', 'realtime']
  write(resolve(root, 'config/harness/access-scenarios.json'), `${JSON.stringify({
    version: '1.0.0',
    scenarios: actors.flatMap((actor, actorIndex) => surfaces.map((surface, surfaceIndex) => ({
      id: `${actor}-${surface}`,
      actor,
      surface,
      allow: actorIndex + surfaceIndex >= 0,
    }))),
  }, null, 2)}\n`)
}

function withFixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-access-'))
  try {
    writeScenarios(root)
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('tracks final function ACLs, dropped overloads, and invoker views', () => {
  withFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_base.sql'), `
      create table public.items(id uuid primary key);
      alter table public.items enable row level security;
      create policy items_read on public.items for select to authenticated using (true);
      create view public.items_view with (security_invoker = on) as select * from public.items;
      create function public.lookup_item(p_id uuid)
      returns boolean language sql security definer as $$ select true $$;
      grant execute on function public.lookup_item(uuid) to authenticated;
    `)
    write(resolve(root, 'supabase/migrations/20260102000000_harden.sql'), `
      drop function if exists public.lookup_item(uuid);
      create function public.lookup_item(p_id uuid, p_actor uuid)
      returns boolean language sql security invoker
      set search_path = public, pg_catalog as $$ select true $$;
      revoke all on function public.lookup_item(uuid, uuid) from public, anon, authenticated;
      grant execute on function public.lookup_item(uuid, uuid) to service_role;
    `)
    const matrix = buildAccessMatrix({ root })
    assert.deepEqual(matrix.views, [{ name: 'items_view', securityInvoker: true }])
    assert.equal(matrix.functions.some((entry) => entry.signature === 'lookup_item(uuid)'), false)
    assert.deepEqual(matrix.functions.find((entry) => entry.signature === 'lookup_item(uuid, uuid)'), {
      signature: 'lookup_item(uuid, uuid)',
      securityDefiner: false,
      fixedSearchPath: true,
      executeRoles: ['service_role'],
    })
    write(resolve(root, 'config/harness/access-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
    assert.deepEqual(checkAccessMatrix({ root }).problems, [])
  })
})

test('rejects a broad SECURITY DEFINER function without a fixed search path', () => {
  withFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_unsafe.sql'), `
      create table public.items(id uuid primary key);
      alter table public.items enable row level security;
      create function public.unsafe_lookup(p_id uuid)
      returns boolean language sql security definer as $$ select true $$;
      grant execute on function public.unsafe_lookup(uuid) to authenticated;
    `)
    const matrix = buildAccessMatrix({ root })
    write(resolve(root, 'config/harness/access-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
    const report = checkAccessMatrix({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('lacks fixed search_path: unsafe_lookup(uuid)')))
    assert.ok(report.problems.some((problem) => problem.includes('broad execute grant: unsafe_lookup(uuid)')))
  })
})

test('tracks every target in a multi-function execute revoke', () => {
  withFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_multi_revoke.sql'), `
      create table public.items(id uuid primary key);
      alter table public.items enable row level security;
      create function public.first_guard(uuid) returns boolean language sql security definer set search_path = '' as 'select true';
      create function public.second_guard(uuid, text) returns boolean language sql security definer set search_path = '' as 'select true';
      revoke execute on function public.first_guard(uuid), public.second_guard(uuid, text) from public, anon, authenticated;
      grant execute on function public.first_guard(uuid), public.second_guard(uuid, text) to service_role;
    `)
    const matrix = buildAccessMatrix({ root })
    write(resolve(root, 'config/harness/access-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
    assert.deepEqual(checkAccessMatrix({ root }).problems, [])
    assert.deepEqual(
      matrix.functions.map((entry) => [entry.signature, entry.executeRoles]),
      [
        ['first_guard(uuid)', ['service_role']],
        ['second_guard(uuid, text)', ['service_role']],
      ],
    )
  })
})


test('rejects a public view without security_invoker', () => {
  withFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_unsafe_view.sql'), `
      create table public.items(id uuid primary key);
      alter table public.items enable row level security;
      create view public.items_view as select * from public.items;
    `)
    const matrix = buildAccessMatrix({ root })
    write(resolve(root, 'config/harness/access-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
    const report = checkAccessMatrix({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.includes('public view is not security_invoker: items_view'))
  })
})

test('rejects policies that reference the wrong admin helper schema', () => {
  withFixture((root) => {
    write(resolve(root, 'supabase/migrations/20260101000000_wrong_admin_helper.sql'), `
      create table public.items(id uuid primary key);
      alter table public.items enable row level security;
      create policy items_admin on public.items for select to authenticated using (public.is_admin());
    `)
    const matrix = buildAccessMatrix({ root })
    write(resolve(root, 'config/harness/access-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
    const report = checkAccessMatrix({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.includes('policy references public.is_admin(); use private.is_admin()'))
  })
})

test('uses the same migration digest across checkout line endings', () => {
  withFixture((root) => {
    const path = resolve(root, 'supabase/migrations/20260101000000_base.sql')
    const source = [
      'create table public.items(id uuid primary key);',
      'alter table public.items enable row level security;',
      'create policy items_read on public.items for select to authenticated using (true);',
      '',
    ].join('\n')
    write(path, source)
    const lf = buildAccessMatrix({ root })
    write(path, source.replaceAll('\n', '\r\n'))
    const crlf = buildAccessMatrix({ root })

    assert.equal(crlf.source.migrationDigest, lf.source.migrationDigest)
  })
})
