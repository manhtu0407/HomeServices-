import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHostedStateArgs } from './hosted-state.mjs'

const required = [
  '--environment', 'production',
  '--project-ref', 'iwevizmsedyqozxlawwl',
  '--project-url', 'https://iwevizmsedyqozxlawwl.supabase.co',
  '--output', 'artifacts/release/hosted-before.json',
]

test('hosted state collection opts into a degraded baseline only with an explicit flag', () => {
  assert.deepEqual(parseHostedStateArgs(required), {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    output: 'artifacts/release/hosted-before.json',
  })
  assert.deepEqual(parseHostedStateArgs([...required, '--allow-unhealthy-runtime-baseline']), {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    output: 'artifacts/release/hosted-before.json',
    allowUnhealthyRuntimeBaseline: true,
  })
  assert.throws(
    () => parseHostedStateArgs([...required, '--allow-unhealthy-runtime-baseline', '--allow-unhealthy-runtime-baseline']),
    /may be supplied only once/u,
  )
})
