import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_ROOT = resolve(ROOT, 'supabase/tests')
const OUTPUT_ROOT = resolve(ROOT, '.scratch/staging-concurrency-verification')

const CASES = [
  {
    name: 'broadcast_retry_claims_verification.sql',
    cleanup: `
delete from public.job_broadcasts where job_id = 'b7130000-0000-4000-8000-000000000001';
delete from public.job_broadcast_retry_claims where job_id = 'b7130000-0000-4000-8000-000000000001';
delete from public.jobs where id = 'b7130000-0000-4000-8000-000000000001';
delete from auth.users where id in (
  'b7110000-0000-4000-8000-000000000001',
  'b7120000-0000-4000-8000-000000000001'
);`,
  },
  {
    name: 'learning_queue_atomic_claims_verification.sql',
    cleanup: `
delete from public.kael_rule_lifecycle_log
where safe_metadata->>'q4_queue_id' = 'd9100000-0000-4000-8000-000000000003';
delete from public.kael_learning_queue where id in (
  'd9100000-0000-4000-8000-000000000001',
  'd9100000-0000-4000-8000-000000000002',
  'd9100000-0000-4000-8000-000000000003'
);`,
  },
  {
    name: 'scope_change_idempotency_verification.sql',
    cleanup: `
delete from public.jobs where id = 'd1110000-0000-4000-8000-000000000001';
delete from auth.users where id in (
  'd1120000-0000-4000-8000-000000000001',
  'd1120000-0000-4000-8000-000000000002'
);`,
  },
  {
    name: 'public_coverage_capacity_concurrency_verification.sql',
    cleanup: `
delete from public.jobs where customer_id in (
  'd6710000-0000-4000-8000-000000000001',
  'd6710000-0000-4000-8000-000000000002'
);
delete from public.kael_chat_sessions where id in (
  'd6710000-0000-4000-8000-000000000101',
  'd6710000-0000-4000-8000-000000000102'
);
delete from auth.users where id in (
  'd6710000-0000-4000-8000-000000000001',
  'd6710000-0000-4000-8000-000000000002',
  'd6710000-0000-4000-8000-000000000011',
  'd6710000-0000-4000-8000-000000000012',
  'd6710000-0000-4000-8000-000000000013',
  'd6710000-0000-4000-8000-000000000014'
);`,
  },
]

function resolveInsideRoot(value) {
  const path = resolve(ROOT, value)
  const local = relative(ROOT, path)
  if (!local || local.startsWith('..')) throw new Error(`path escapes repository root: ${value}`)
  return path
}

function afterLine(source, index) {
  const newline = source.indexOf('\n', index)
  return newline === -1 ? source.length : newline + 1
}

export function prepareLinkedConcurrencySql(source) {
  const extensionMarker = 'create extension if not exists dblink;'
  const extensionIndex = source.indexOf(extensionMarker)
  const connectIndex = source.indexOf('select dblink_connect(')
  if (extensionIndex === -1 || connectIndex === -1) throw new Error('missing dblink setup markers')

  const sends = [...source.matchAll(/select dblink_send_query\('[^']+', \$remote\$\s*([\s\S]*?)\s*\$remote\$\);/gu)]
  if (sends.length !== 2) throw new Error(`expected exactly two concurrent queries, found ${sends.length}`)

  const disconnects = [...source.matchAll(/select dblink_disconnect\('[^']+'\);/gu)]
  if (disconnects.length !== 2) throw new Error(`expected exactly two disconnect markers, found ${disconnects.length}`)
  const postStart = afterLine(source, disconnects[1].index)
  const extensionCleanupStart = source.indexOf('\\if :dblink_preexisting', postStart)
  const extensionCleanupEnd = source.indexOf('\\endif', extensionCleanupStart)
  if (extensionCleanupStart === -1 || extensionCleanupEnd === -1) {
    throw new Error('missing conditional dblink cleanup markers')
  }

  const tableMatch = source.match(/create temporary table ([a-z_]+) \(payload jsonb not null\);/u)
  if (!tableMatch) throw new Error('missing concurrent results table')

  const queries = sends.map((match) => {
    const query = match[1].trim()
    const instrumented = query.replace(
      /select pg_catalog\.row_to_json\(([^)]+)\)::text\s+from/u,
      "select pg_catalog.jsonb_build_object('backend_pid', pg_catalog.pg_backend_pid(), 'payload', pg_catalog.row_to_json($1)) as concurrency_result\n  from",
    )
    if (instrumented === query) throw new Error('concurrent query result could not be instrumented')
    return `${instrumented}\n`
  })

  return {
    setup: source.slice(afterLine(source, extensionIndex), connectIndex).trim(),
    queries,
    tableName: tableMatch[1],
    post: `${source.slice(postStart, extensionCleanupStart).trim()}\n\n${source.slice(afterLine(source, extensionCleanupEnd)).trim()}`,
  }
}

export function withoutLearningCrashRollbackProbe(sql) {
  const normalized = sql.replaceAll('\r\n', '\n')
  const startMarker = 'begin;\nselect *\nfrom public.complete_kael_learning_queue_realtime_atomic('
  const endMarker = 'create temporary table learning_finalize_first as'
  const start = normalized.indexOf(startMarker)
  const end = normalized.indexOf(endMarker, start)
  if (start === -1 || end === -1) throw new Error('missing learning crash rollback probe markers')
  return `${normalized.slice(0, start).trim()}\n\n${normalized.slice(end).trim()}`
}

function parseCliJson(output) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error(`Supabase CLI returned no JSON payload:\n${output}`)
  return JSON.parse(output.slice(start, end + 1))
}

function runQueryFile(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [
      'scripts/run.mjs', 'run-supabase', 'db', 'query', '--linked',
      '--file', path, '--output', 'json',
    ], { cwd: ROOT, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      const output = `${stdout}\n${stderr}`.trim()
      if (code !== 0) {
        rejectPromise(new Error(output))
        return
      }
      try {
        resolvePromise(parseCliJson(output))
      } catch (error) {
        rejectPromise(error)
      }
    })
  })
}

function sqlJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
}

function assertStagingLink() {
  throw new Error('Staging backend is locked; linked concurrency verification is unavailable.')
}

async function runLearningCrashRollbackProbe(prefix, cleanupSql) {
  const setupPath = resolveInsideRoot(`.scratch/staging-concurrency-verification/${prefix}.crash-setup.sql`)
  const rollbackPath = resolveInsideRoot(`.scratch/staging-concurrency-verification/${prefix}.crash-rollback.sql`)
  const assertPath = resolveInsideRoot(`.scratch/staging-concurrency-verification/${prefix}.crash-assert-cleanup.sql`)
  writeFileSync(setupPath, `
${cleanupSql}

insert into public.kael_learning_queue (
  id, event_type, skill_id, queue_state, input_payload, candidate_payload, run_after, created_at
) values (
  'd9100000-0000-4000-8000-000000000003',
  'post-B6',
  'LS3',
  'pending',
  '{"source":"atomic-finalize"}'::jsonb,
  '{"target":"scope-change","prompt_version":"q4-test","requires_manual_review":false,"payload":{"safe":true}}'::jsonb,
  '2026-07-15T00:00:00Z',
  '2026-07-15T00:00:02Z'
);

do $$
begin
  perform * from public.claim_kael_learning_queue_atomic(
    'd9200000-0000-4000-8000-000000000005',
    1,
    '2026-07-15T00:22:00Z'
  );
  if not exists (
    select 1 from public.kael_learning_queue
    where id = 'd9100000-0000-4000-8000-000000000003'
      and queue_state = 'processing'
      and claim_id = 'd9200000-0000-4000-8000-000000000005'
  ) then
    raise exception 'learning crash probe could not establish the claimed state';
  end if;
end $$;
`)
  writeFileSync(rollbackPath, `
begin;
select * from public.complete_kael_learning_queue_realtime_atomic(
  'd9200000-0000-4000-8000-000000000005',
  array['d9100000-0000-4000-8000-000000000003']::uuid[],
  '2026-07-15T00:24:00Z'
);
rollback;
`)
  writeFileSync(assertPath, `
do $$
begin
  if exists (
    select 1 from public.kael_rule_lifecycle_log
    where safe_metadata->>'q4_queue_id' = 'd9100000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1 from public.kael_learning_queue
    where id = 'd9100000-0000-4000-8000-000000000003'
      and queue_state = 'processing'
      and claim_id = 'd9200000-0000-4000-8000-000000000005'
  ) then
    raise exception 'rolled-back completion left a partial lifecycle effect';
  end if;
end $$;

${cleanupSql}
`)
  await runQueryFile(setupPath)
  await runQueryFile(rollbackPath)
  await runQueryFile(assertPath)
}

async function runCase(testCase) {
  const source = readFileSync(resolve(TEST_ROOT, testCase.name), 'utf8')
  const prepared = prepareLinkedConcurrencySql(source)
  const prefix = testCase.name.replace(/\.sql$/u, '')
  const setupPath = resolveInsideRoot(`.scratch/staging-concurrency-verification/${prefix}.setup.sql`)
  const queryPaths = prepared.queries.map((_, index) => resolveInsideRoot(
    `.scratch/staging-concurrency-verification/${prefix}.concurrent-${index + 1}.sql`,
  ))
  const postPath = resolveInsideRoot(`.scratch/staging-concurrency-verification/${prefix}.assert-cleanup.sql`)
  const cleanupPath = resolveInsideRoot(`.scratch/staging-concurrency-verification/${prefix}.emergency-cleanup.sql`)

  writeFileSync(setupPath, `${testCase.cleanup}\n\n${prepared.setup}\n`)
  prepared.queries.forEach((query, index) => writeFileSync(queryPaths[index], query))
  writeFileSync(cleanupPath, `${testCase.cleanup}\n`)

  let primaryError = null
  try {
    await runQueryFile(setupPath)
    const results = await Promise.all(queryPaths.map((path) => runQueryFile(path)))
    const concurrencyRows = results.map((result) => {
      if (!Array.isArray(result.rows) || result.rows.length !== 1) {
        throw new Error(`${testCase.name}: concurrent query did not return exactly one row`)
      }
      const value = result.rows[0].concurrency_result
      if (!value || typeof value !== 'object' || !value.payload) {
        throw new Error(`${testCase.name}: concurrent query receipt is malformed`)
      }
      return value
    })
    if (new Set(concurrencyRows.map((row) => row.backend_pid)).size !== 2) {
      throw new Error(`${testCase.name}: concurrent calls reused one PostgreSQL backend`)
    }

    const inserts = concurrencyRows.map((row) => `  (${sqlJson(row.payload)})`).join(',\n')
    const postSql = testCase.name === 'learning_queue_atomic_claims_verification.sql'
      ? withoutLearningCrashRollbackProbe(prepared.post)
      : prepared.post
    writeFileSync(postPath, `
create temporary table ${prepared.tableName} (payload jsonb not null);
insert into ${prepared.tableName} (payload) values
${inserts};

${postSql}
`)
    await runQueryFile(postPath)
    if (testCase.name === 'learning_queue_atomic_claims_verification.sql') {
      await runLearningCrashRollbackProbe(prefix, testCase.cleanup)
    }
  } catch (error) {
    primaryError = error
  }

  let cleanupError = null
  try {
    await runQueryFile(cleanupPath)
  } catch (error) {
    cleanupError = error
  }
  if (primaryError || cleanupError) {
    const messages = [primaryError, cleanupError].filter(Boolean).map((error) => error.message)
    throw new Error(messages.join('\nEmergency cleanup failure:\n'))
  }
  console.log(`PASS  ${testCase.name} (two distinct overlapping Staging sessions)`)
}

async function run() {
  assertStagingLink()
  mkdirSync(OUTPUT_ROOT, { recursive: true })
  const failures = []
  for (const testCase of CASES) {
    try {
      await runCase(testCase)
    } catch (error) {
      failures.push({ name: testCase.name, message: error instanceof Error ? error.message : String(error) })
      console.error(`FAIL  ${testCase.name}\n${failures.at(-1).message}`)
    }
  }
  console.log(`linked concurrency verification: ${CASES.length - failures.length} passed / ${failures.length} failed / ${CASES.length} total`)
  if (failures.length) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
