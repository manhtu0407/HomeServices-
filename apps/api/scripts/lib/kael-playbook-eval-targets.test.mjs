import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const EVALUATOR_PATH = resolve(REPO_ROOT, 'apps/api/scripts/kael-eval.mjs')
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const STAGING_REF = 'xyylanuyflrjzbjzhqfl'

test('six-service evaluator rejects hosted targets before any fetch', async (t) => {
  for (const [name, url] of [
    ['production', `https://${PRODUCTION_REF}.supabase.co/functions/v1/mobile-api`],
    ['staging', `https://${STAGING_REF}.supabase.co/functions/v1/mobile-api`],
    ['other-host', 'https://example.com/functions/v1/mobile-api'],
  ]) {
    const result = await runEvaluator(t, { name, url })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /must target local development only/u)
    assert.equal(existsSync(result.fetchMarker), false, `${name} reached fetch`)
  }
})

test('six-service evaluator permits loopback and calls only the intercepted adapter', async (t) => {
  const result = await runEvaluator(t, {
    name: 'loopback',
    url: 'http://127.0.0.1:54321/functions/v1/mobile-api',
  })
  assert.equal(result.status, 86, result.stderr)
  assert.equal(existsSync(result.fetchMarker), true, 'loopback did not reach the intercepted fetch')
})

async function runEvaluator(t, { name, url }) {
  const tempRoot = await mkdtemp(join(tmpdir(), `kael-eval-${name}-`))
  t.after(() => rm(tempRoot, { recursive: true, force: true }))

  const fetchGuardPath = join(tempRoot, 'deny-network.mjs')
  const fetchMarker = join(tempRoot, 'fetch-attempt')
  await writeFile(
    fetchGuardPath,
    "import { writeFileSync } from 'node:fs';globalThis.fetch=async()=>{writeFileSync(process.env.KAEL_EVAL_FETCH_MARKER,'attempted');process.exit(86)}",
  )

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) =>
      ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].includes(key) && value !== undefined,
    ),
  )
  env.KAEL_EVAL_RUN_LIVE = 'yes'
  env.KAEL_EVAL_MOBILE_API_URL = url
  env.KAEL_EVAL_BEARER_TOKEN = 'test-only-token'
  env.KAEL_EVAL_FETCH_MARKER = fetchMarker

  const result = spawnSync(process.execPath, [
    '--import', pathToFileURL(fetchGuardPath).href,
    EVALUATOR_PATH,
    '--mode', 'live',
    '--report', join(tempRoot, `${name}.md`),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: 15000,
  })

  assert.ifError(result.error)
  return { ...result, fetchMarker }
}
