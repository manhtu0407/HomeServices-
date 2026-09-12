import assert from 'node:assert/strict'
import test from 'node:test'
import { functionInventory } from './access-matrix.mjs'

for (const clause of ["set search_path = ''", "SET search_path TO ''"]) {
  test(`recognizes fixed function configuration: ${clause}`, () => {
    const functions = functionInventory(`
      create function public.guarded_dispatch() returns text
      language plpgsql security definer ${clause} as $body$ begin return 'ok'; end; $body$;
      revoke execute on function public.guarded_dispatch() from public, anon, authenticated;
      grant execute on function public.guarded_dispatch() to service_role;
    `)
    assert.deepEqual(functions, [{
      signature: 'guarded_dispatch()', securityDefiner: true,
      fixedSearchPath: true, executeRoles: ['service_role'],
    }])
  })
}

test('tracks ALTER FUNCTION search_path TO configuration', () => {
  const functions = functionInventory(`
    create function public.guarded_dispatch() returns text language sql security definer as 'select 1';
    alter function public.guarded_dispatch() set search_path to '';
  `)
  assert.equal(functions[0].fixedSearchPath, true)
})

for (const clause of ['', 'SET search_path FROM CURRENT']) {
  test(`does not infer an explicit fixed path from ${clause || 'missing configuration'}`, () => {
    const functions = functionInventory(`
      create function public.guarded_dispatch() returns text
      language plpgsql security definer ${clause} as $body$ begin return 'ok'; end; $body$;
    `)
    assert.equal(functions[0].fixedSearchPath, false)
    assert.deepEqual(functions[0].executeRoles, ['public'])
  })
}
