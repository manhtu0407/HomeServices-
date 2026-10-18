import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareRunnerEnv } from '../run.mjs'
import { assertLocalQaBindings, loopbackQaDockerArgs } from './local-qa-network.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const digest = text => createHash('sha256').update(text).digest('hex')

function bootstrap({ instance, portBase, profile }) {
  return `import { createLocalProviderFixtureFetch } from './fixture-network.mjs';
const localOrigin = ${JSON.stringify(`http://host.docker.internal:${portBase + 1}`)};
if (Deno.env.get('SUPABASE_URL') !== localOrigin || Deno.env.get('KAEL_AI_KILL_SWITCH') !== 'true') throw new Error('QA payment runtime refused');
for (const key of ['ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','PERPLEXITY_API_KEY','OPENAI_API_KEY']) {
  if (Deno.env.get(key)) throw new Error('QA payment credential refused');
}
const fixture = createLocalProviderFixtureFetch({ localOrigin, reply: {}, fetch: globalThis.fetch.bind(globalThis) });
globalThis.fetch = fixture.fetch;
const { createEdgeAuthenticator } = await import('../mobile-api/_shared/platform/auth.ts');
const { readEdgeEnv, assertProductionReleaseRegistered } = await import('../_shared/platform/env.ts');
const { createMobileApiHandler } = await import('../mobile-api/_shared/http.ts');
const { createEdgeServices } = await import('../mobile-api/_shared/domains.ts');
const env = readEdgeEnv(name => Deno.env.get(name) ?? undefined);
if (env.harnessEnvironment.name !== 'local' || !env.aiKillSwitch) throw new Error('QA payment environment refused');
assertProductionReleaseRegistered(env);
${profile === 'cancellation' ? "const readRuntimeEnv = Deno.env.get.bind(Deno.env); Deno.env.get = name => name === 'KAEL_AUTONOMY_FULL_ENABLED' ? 'true' : readRuntimeEnv(name); if (Deno.env.get('KAEL_AI_KILL_SWITCH') !== 'true') throw new Error('QA cancellation inference guard refused');" : ''}
const services = createEdgeServices(${profile === 'payment' ? "{ ...env, manualBank: { enabled: true, bankCode: 'QA', accountNumber: 'QAONLY', accountHolder: 'QA FIXTURE DO NOT TRANSFER' } }" : 'env'});
const handler = createMobileApiHandler({ authenticate: createEdgeAuthenticator(env), services, releaseId: env.releaseId, environment: env.harnessEnvironment.name, minimumClientBuildNumber: env.minimumClientBuildNumber, clientCompatibility: env.clientCompatibility });
Deno.serve(async request => {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/__qa_fixture')) return Response.json({ mode: '${profile}-fixture', instance: ${JSON.stringify(instance)}, counts: fixture.counts() }, { headers: { 'cache-control': 'no-store' } });
  url.pathname = url.pathname.replace(new RegExp('/qa-${profile}-fixture-[a-f0-9]{12}(?=/|$)', 'u'), '/mobile-api');
  const before = fixture.counts();
  const response = await handler(new Request(url, request));
  const after = fixture.counts();
  const headers = new Headers(response.headers);
  headers.set('x-qa-provider-fixture-calls', String(after.providerFixture - before.providerFixture));
  headers.set('x-qa-denied-calls', String(after.denied - before.denied));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
`
}

export function installLocalPaymentFixture(options) {
  return installLocalWorkflowFixture({ ...options, profile: 'payment' })
}

export function installLocalCancellationFixture(options) {
  return installLocalWorkflowFixture({ ...options, profile: 'cancellation' })
}

function installLocalWorkflowFixture({ instance, portBase, profile, root = repoRoot, run = spawnSync }) {
  let stage = 'arguments'
  try {
    loopbackQaDockerArgs(instance, portBase, 'node', [])
    const project = `nestscout-qa-${instance}`
    const workdir = join(root, `.scratch/local-migrations-qa-${instance}`)
    stage = 'local project'
    const config = readFileSync(join(workdir, 'supabase/config.toml'), 'utf8')
    const plan = JSON.parse(readFileSync(join(workdir, 'apply-plan.json'), 'utf8'))
    if (!config.includes(`project_id = "${project}"`) || plan.environment !== 'local' || plan.mode !== 'empty-reset' ||
      plan.projectRef !== project || plan.localRuntime?.name !== instance || plan.localRuntime?.portBase !== portBase) throw new Error('target mismatch')
    const canonical = join(root, 'supabase/functions/mobile-api')
    const copied = join(workdir, 'supabase/functions/mobile-api')
    stage = 'source identity'
    const index = readFileSync(join(copied, 'index.ts'), 'utf8')
    const deno = readFileSync(join(copied, 'deno.json'), 'utf8')
    if (index !== readFileSync(join(canonical, 'index.ts'), 'utf8') || deno !== readFileSync(join(canonical, 'deno.json'), 'utf8')) throw new Error('source mismatch')
    stage = 'loopback bindings'
    assertLocalQaBindings(instance, run)
    stage = 'runtime environment'
    const inspected = run('docker', ['inspect', '--type', 'container', `supabase_edge_runtime_${project}`, '--format', '{{json .}}'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
    if (inspected.error || inspected.status !== 0) throw new Error('runtime missing')
    const container = JSON.parse(inspected.stdout)
    const env = Object.fromEntries(container.Config.Env.map(value => { const n = value.indexOf('='); return [value.slice(0, n), value.slice(n + 1)] }))
    if (container.Config.Labels?.['com.supabase.cli.project'] !== project || env.KAEL_AI_KILL_SWITCH !== 'true' ||
      env.SUPABASE_URL !== `http://host.docker.internal:${portBase + 1}` ||
      Object.entries(env).some(([key, value]) => /^(ANTHROPIC|DEEPSEEK|PERPLEXITY|OPENAI|SEPAY|SENTRY|TELEGRAM)_/u.test(key) && value)) throw new Error('unsafe runtime')
    stage = 'fixture generation'
    const envFile = join(workdir, 'qa-fixture.env')
    if (existsSync(envFile) && readFileSync(envFile, 'utf8') !== '') throw new Error('fixture environment collision')
    const network = readFileSync(new URL('./local-provider-fixture.mjs', import.meta.url), 'utf8')
    const entry = bootstrap({ instance, portBase, profile })
    const fixtureDigest = digest(entry + network + deno + index)
    const functionName = `qa-${profile}-fixture-${fixtureDigest.slice(0, 12)}`
    const directory = join(workdir, 'supabase/functions', functionName)
    const identity = { mode: `${profile}-fixture`, instance, fixtureDigest, canonicalEntrySha256: digest(index) }
    const files = { 'index.ts': entry, 'fixture-network.mjs': network, 'deno.json': deno, 'fixture-identity.json': JSON.stringify(identity, null, 2) + '\n' }
    stage = 'fixture files'
    if (existsSync(directory)) {
      if (Object.entries(files).some(([name, value]) => readFileSync(join(directory, name), 'utf8') !== value)) throw new Error('fixture collision')
    } else {
      mkdirSync(directory)
      for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), value)
    }
    stage = 'local registration'
    if (!existsSync(envFile)) writeFileSync(envFile, '')
    const section = `[functions.${functionName}]\nverify_jwt = false\n`
    if (!config.includes(`[functions.${functionName}]`)) writeFileSync(join(workdir, 'supabase/config.toml'), `${config}\n${section}`)
    writeFileSync(join(workdir, `qa-${profile}-fixture.json`), JSON.stringify({ ...identity, functionName }) + '\n')
    return { ...identity, functionName }
  } catch { throw new Error('QA payment fixture target refused', { cause: stage }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6 || process.argv[2] !== '--instance' || process.argv[4] !== '--port-base') throw new Error('arguments refused')
    const env = prepareRunnerEnv()
    const run = (command, args, options) => spawnSync(command, args, { ...options, env })
    console.log(JSON.stringify(installLocalPaymentFixture({ instance: process.argv[3], portBase: Number(process.argv[5]), run })))
  } catch (error) { console.error(`QA payment fixture target refused at ${error.cause ?? 'arguments'}`); process.exitCode = 2 }
}
