import assert from 'node:assert/strict'
import test from 'node:test'

import {
  prepareLinkedConcurrencySql,
  withoutLearningCrashRollbackProbe,
} from './run-linked-concurrency-verification.mjs'

test('replaces dblink transport while preserving setup and post-assertion SQL', () => {
  const source = String.raw`\set ON_ERROR_STOP on
create extension if not exists dblink;
select 'setup';
select dblink_connect('a', :'conn');
select dblink_connect('b', :'conn');
select dblink_send_query('a', $remote$
select pg_catalog.row_to_json(claimed)::text from claimed cross join paused;
$remote$);
select dblink_send_query('b', $remote$
select pg_catalog.row_to_json(claimed)::text from claimed cross join paused;
$remote$);
create temporary table concurrent_results (payload jsonb not null);
select dblink_disconnect('a');
select dblink_disconnect('b');
do $$ begin perform 1 from concurrent_results; end $$;
\if :dblink_preexisting
\else
drop extension dblink;
\endif
select 'finished';`

  const prepared = prepareLinkedConcurrencySql(source)
  assert.match(prepared.setup, /select 'setup'/u)
  assert.equal(prepared.queries.length, 2)
  assert.match(prepared.queries[0], /backend_pid/u)
  assert.match(prepared.queries[0], /concurrency_result/u)
  assert.equal(prepared.tableName, 'concurrent_results')
  assert.match(prepared.post, /perform 1 from concurrent_results/u)
  assert.match(prepared.post, /select 'finished'/u)
  assert.doesNotMatch(prepared.post, /drop extension/u)
})

test('isolates the learning crash rollback probe from the batched main assertion', () => {
  const sql = `before;
begin;
select *
from public.complete_kael_learning_queue_realtime_atomic();
rollback;
do $$ begin raise exception 'rolled-back completion left a partial lifecycle effect'; end $$;
create temporary table learning_finalize_first as select 1;
after;`
  const prepared = withoutLearningCrashRollbackProbe(sql)
  assert.match(prepared, /before/u)
  assert.match(prepared, /learning_finalize_first/u)
  assert.match(prepared, /after/u)
  assert.doesNotMatch(prepared, /rollback;/u)
  assert.doesNotMatch(prepared, /partial lifecycle effect/u)
})
