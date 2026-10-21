import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { computeSourceTreeHash, normalizeSourceFiles } from '../../../scripts/lib/kael-playbook-source-hash.mjs'

export const PILLAR = {
  id: 'P402-kael-eval-report-contract',
  invariant:
    'evaluation reports distinguish local fixture agreement from measured model accuracy, preserve mismatches, reject undersized cohorts, and never claim provider execution without evidence',
  authority: [
    'KAWA_01_Foundation_Safety_Evaluation.pdf W02 input (truthful evaluator taxonomy and report-contract cases)',
    'governance/RULES.md #8 (no fake success or silent degradation)',
    'governance/critical.md #3 (no false completion)',
  ],
  target: 'apps/api/scripts/kael-eval.mjs',
  layer: 'integration',
  siblings: ['P45-kael-intake-observation-failure'],
  mutation:
    'remove the measurement-scope metadata from the JSON summary; the deterministic-report contract assertion turns red',
} as const satisfies PillarManifest

const repoRoot = resolve(__dirname, '../../../../../')
const evalScriptPath = resolve(repoRoot, 'apps/api/scripts/kael-eval.mjs')
const fixturePath = resolve(repoRoot, 'apps/api/fixtures/kael-eval/golden-cases.json')
const knowledgeFixturePath = resolve(repoRoot, 'apps/api/fixtures/kael-eval/knowledge-cases.json')
let tempPath = ''

beforeEach(() => {
  tempPath = mkdtempSync(join(tmpdir(), 'kael-eval-report-pillar-'))
})

afterEach(() => {
  if (tempPath) rmSync(tempPath, { recursive: true, force: true })
  tempPath = ''
})

describe('P402 Kael evaluator report contract', () => {
  it('marks a deliberate golden-label mismatch as a failed sample', async () => {
    const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<{
      id: string
      input: { service_type: string }
      expected: { service_type: string }
    }>
    const target = fixtures.find((fixture) => fixture.expected.service_type !== 'unsupported')
    expect(target).toBeDefined()
    if (!target) throw new Error('golden dataset has no supported fixture')

    target.expected.service_type = target.input.service_type === 'electrical' ? 'plumbing' : 'electrical'
    const mismatchedFixturePath = join(tempPath, 'mismatched-fixtures.json')
    const jsonPath = join(tempPath, 'mismatch-summary.json')
    const reportPath = join(tempPath, 'mismatch-report.md')
    writeFileSync(mismatchedFixturePath, JSON.stringify(fixtures))

    const result = await runEvaluator([
      '--mode', 'deterministic',
      '--fixtures', mismatchedFixturePath,
      '--knowledge-fixtures', knowledgeFixturePath,
      '--report', reportPath,
      '--json-output', jsonPath,
    ], { KAEL_EVAL_SERVICE_THRESHOLD: '1' })

    expect(result.status, pillarWhy(PILLAR, 'a mismatch beyond the configured threshold must fail the command')).toBe(1)
    const summary = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      status: string
      failureCases: Array<{ id: string; kind?: string }>
      samples: Array<{ id: string; success: boolean }>
    }
    expect(summary.status).toBe('failed')
    expect(summary.failureCases.find((failure) => failure.id === target.id)?.kind).toBe('fixture_mismatch')
    expect(summary.samples.find((sample) => sample.id === target.id)?.success).toBe(false)
  })

  it('refuses to produce an evaluation report from fewer than 75 fixtures', async () => {
    const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[]
    const shortFixturePath = join(tempPath, 'short-fixtures.json')
    const jsonPath = join(tempPath, 'short-summary.json')
    const reportPath = join(tempPath, 'short-report.md')
    writeFileSync(shortFixturePath, JSON.stringify(fixtures.slice(0, 74)))

    const result = await runEvaluator([
      '--mode', 'deterministic',
      '--fixtures', shortFixturePath,
      '--knowledge-fixtures', knowledgeFixturePath,
      '--report', reportPath,
      '--json-output', jsonPath,
    ])

    expect(result.status, pillarWhy(PILLAR, 'an undersized cohort cannot support the configured evaluation thresholds')).toBe(1)
    expect(result.stderr).toContain('A5 fixture set must include at least 75 cases')
    expect(existsSync(jsonPath)).toBe(false)
    expect(existsSync(reportPath)).toBe(false)
  })

  it('fails closed when the local mobile-api endpoint has no provider response', async () => {
    let requestCount = 0
    const server = createServer((_request, response) => {
      requestCount += 1
      response.writeHead(503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'PRIVATE_RESPONSE_SENTINEL' }))
    })
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolvePromise)
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('loopback server did not bind a TCP port')
      const jsonPath = join(tempPath, 'unavailable-summary.json')
      const reportPath = join(tempPath, 'unavailable-report.md')
      const result = await runEvaluator([
        '--mode', 'live',
        '--fixtures', fixturePath,
        '--knowledge-fixtures', knowledgeFixturePath,
        '--report', reportPath,
        '--json-output', jsonPath,
      ], {
        KAEL_EVAL_RUN_LIVE: 'yes',
        KAEL_EVAL_MOBILE_API_URL: 'http://127.0.0.1:' + address.port + '/functions/v1/mobile-api',
        KAEL_EVAL_BEARER_TOKEN: 'test-token',
      })

      expect(result.status, pillarWhy(PILLAR, 'HTTP 503 responses are endpoint errors, not successful Kael declines')).toBe(1)
      const summary = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        status: string
        evidenceClass: string
        evidenceTier: string
        evaluator: { id: string; kind: string }
        measurement: { modelAccuracy: number | null; providerInvocation: string; sampleSize: number }
        executionErrors?: number
        critical: { safetyFailures: number }
        failureCases: Array<{ kind?: string; errorCode?: string | null }>
        samples: Array<{ success: boolean; evaluationError?: string | null; criticalSafetyFailure: boolean }>
        metrics: { serviceAccuracy: number | null; costPerCaseUsd: number | null }
      }
      expect(summary.status).toBe('failed')
      expect(summary.evidenceClass).toBe('live_shadow')
      expect(summary.evidenceTier, pillarWhy(PILLAR, 'a synthetic loopback endpoint cannot attest the stack behind it, so it must not read as T1 local integration')).toBe('unattested')
      expect(summary.evaluator).toEqual({ id: 'kael-mobile-api-shadow-v1', kind: 'endpoint_shadow', version: '1.0.0' })
      expect(summary.measurement).toMatchObject({
        scope: 'api_shadow_fixture_agreement',
        modelAccuracy: null,
        providerInvocation: 'unverified',
        sampleSize: 99,
      })
      expect(summary.executionErrors).toBe(99)
      expect(summary.critical.safetyFailures).toBe(0)
      expect(summary.failureCases.every((failure) => failure.kind === 'evaluation_error' && failure.errorCode === 'http_503')).toBe(true)
      expect(summary.samples.every((sample) => !sample.success && sample.evaluationError === 'http_503')).toBe(true)
      expect(summary.samples.every((sample) => !sample.criticalSafetyFailure)).toBe(true)
      expect(summary.metrics.serviceAccuracy).toBeNull()
      expect(summary.metrics.costPerCaseUsd).toBeNull()
      expect(requestCount).toBe(99)
      expect(readFileSync(jsonPath, 'utf8')).not.toContain('PRIVATE_RESPONSE_SENTINEL')
      expect(readFileSync(reportPath, 'utf8')).not.toContain('PRIVATE_RESPONSE_SENTINEL')
      expect(readFileSync(reportPath, 'utf8')).toContain('Provider invocation: unverified')
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    }
  })

  it('requires explicit live opt-in before starting endpoint evaluation', async () => {
    const jsonPath = join(tempPath, 'not-opted-in-summary.json')
    const reportPath = join(tempPath, 'not-opted-in-report.md')
    const result = await runEvaluator([
      '--mode', 'live',
      '--fixtures', fixturePath,
      '--knowledge-fixtures', knowledgeFixturePath,
      '--report', reportPath,
      '--json-output', jsonPath,
    ])

    expect(result.status, pillarWhy(PILLAR, 'live evaluation must not start unless the operator opts in')).toBe(1)
    expect(result.stderr).toContain('Set KAEL_EVAL_RUN_LIVE=yes')
    expect(existsSync(jsonPath)).toBe(false)
    expect(existsSync(reportPath)).toBe(false)
  })

  it('labels deterministic output as fixture agreement and leaves model accuracy unmeasured', async () => {
    const jsonPath = join(tempPath, 'summary.json')
    const reportPath = join(tempPath, 'report.md')
    const result = await runEvaluator([
      '--mode', 'deterministic',
      '--fixtures', fixturePath,
      '--knowledge-fixtures', knowledgeFixturePath,
      '--report', reportPath,
      '--json-output', jsonPath,
    ])

    expect(result.status, pillarWhy(PILLAR, result.stderr)).toBe(0)
    const summary = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      schemaVersion: string
      evidenceClass: string
      evidenceTier: string
      evaluator: { id: string; kind: string }
      measurement: {
        scope: string
        modelAccuracy: number | null
        providerInvocation: string
        sampleSize: number
        minimumSampleSize: number
      }
      knowledge_ab: { measurement: { scope: string; modelAccuracy: number | null; providerInvocation: string } }
      metrics: { serviceAccuracy: number }
    }
    expect(summary.schemaVersion, pillarWhy(PILLAR, 'the report schema version must identify the explicit measurement contract')).toBe('1.1.0')
    expect(summary.evidenceClass).toBe('deterministic')
    expect(summary.evidenceTier, pillarWhy(PILLAR, 'deterministic fixture output must carry the T0 tier tag')).toBe('T0')
    expect(summary.evaluator).toEqual({ id: 'kael-deterministic-v1', kind: 'deterministic', version: '1.0.0' })
    expect(summary.measurement).toEqual({
      scope: 'fixture_agreement',
      modelAccuracy: null,
      providerInvocation: 'not_attempted',
      sampleSize: 99,
      minimumSampleSize: 75,
    })
    expect(summary.metrics.serviceAccuracy).toBe(1)
    expect(summary.knowledge_ab.measurement).toEqual({
      scope: 'deterministic_knowledge_fixture_agreement',
      modelAccuracy: null,
      providerInvocation: 'not_attempted',
      sampleSize: 6,
      minimumSampleSize: 6,
    })

    const report = readFileSync(reportPath, 'utf8')
    expect(report).toContain('Evidence tier: T0')
    expect(report).toContain('Measurement scope: fixture_agreement')
    expect(report).toContain('Model accuracy: not measured')
    expect(report).toContain('100% means fixture agreement')
    expect(report, pillarWhy(PILLAR, 'the report says the 100-case blueprint has no authored cases and this suite is not it')).toContain('plan with 0 authored cases')
  })

  describe('the 100-case evaluation blueprint', () => {
    const blueprint = JSON.parse(readFileSync(resolve(repoRoot, 'apps/api/fixtures/kael-eval/evaluation-blueprint-100.json'), 'utf8')) as {
      status: string
      planned_cases: number
      authored_cases: number
      required_case_fields: string[]
      groups: Array<{ id: string; planned_cases: number; authored_cases: number; focus: string[] }>
    }

    it('plans exactly 100 cases in the six groups 20/20/15/20/15/10 the Master Plan defines', () => {
      expect(blueprint.groups.map((group) => group.planned_cases), pillarWhy(PILLAR, 'group quotas')).toEqual([20, 20, 15, 20, 15, 10])
      expect(blueprint.groups.reduce((sum, group) => sum + group.planned_cases, 0), pillarWhy(PILLAR, 'the quotas add up')).toBe(100)
      expect(blueprint.planned_cases, pillarWhy(PILLAR, 'the stated total equals the sum')).toBe(100)
      expect(new Set(blueprint.groups.map((group) => group.id)).size, pillarWhy(PILLAR, 'group ids are unique')).toBe(6)
      expect(blueprint.groups.every((group) => group.focus.length > 0), pillarWhy(PILLAR, 'every group says what it covers')).toBe(true)
    })

    it('requires gold conditions, an evaluator and negative conditions on every case', () => {
      for (const field of ['gold_conditions', 'evaluator', 'negative_conditions', 'evidence_tier']) {
        expect(blueprint.required_case_fields, pillarWhy(PILLAR, `a case without ${field} cannot be judged`)).toContain(field)
      }
    })

    it('claims no authored case and no measurement: it is a plan, and the 99-case suite is not it', () => {
      expect(blueprint.status, pillarWhy(PILLAR, 'blueprint only')).toBe('blueprint_only')
      expect(blueprint.authored_cases, pillarWhy(PILLAR, 'no case has been written, so none is claimed')).toBe(0)
      expect(blueprint.groups.every((group) => group.authored_cases === 0), pillarWhy(PILLAR, 'per group')).toBe(true)
      const golden = JSON.parse(readFileSync(resolve(repoRoot, 'apps/api/fixtures/kael-eval/golden-cases.json'), 'utf8')) as unknown[]
      expect(golden.length, pillarWhy(PILLAR, 'the deterministic suite is a different, smaller thing than the planned 100')).not.toBe(blueprint.planned_cases)
    })
  })
})

function runEvaluator(args: string[], overrides: Record<string, string> = {}) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('KAEL_EVAL_')) delete env[key]
  }
  Object.assign(env, overrides)

  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [evalScriptPath, ...args], {
      cwd: repoRoot,
      env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (status) => resolvePromise({ status, stdout, stderr }))
  })
}

describe('P402 the playbook evaluator binds a report to the emergency behavior it ran against', () => {
  const scriptPath = resolve(repoRoot, 'apps/api/scripts/kael-playbook-eval.mjs')
  const sharedRoot = resolve(repoRoot, 'supabase/functions/mobile-api/_shared')
  const listed = (): string[] => {
    const block = /const SOURCE_FILES = \[([\s\S]*?)\n\]/.exec(readFileSync(scriptPath, 'utf8'))?.[1] ?? ''
    return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
  }
  const rel = (path: string) => relative(repoRoot, path).split(sep).join('/')

  // Every Edge file that calls an emergency resolver or the shared text collector, found by reading the source so a
  // new caller is covered without anyone remembering to list it.
  const gateFiles = (): string[] => {
    const found: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts') && /\b(?:resolveCaseEmergency|answerParkedEmergency|answerCaseEmergency|customerAuthoredTexts|resolveReportedEmergencyGuidance\w*|resolveEmergencyGuidance)\b/.test(readFileSync(path, 'utf8'))) {
          found.push(rel(path))
        }
      }
    }
    walk(sharedRoot)
    return found.sort()
  }
  const directImports = (file: string): string[] => {
    const absolute = resolve(repoRoot, file)
    const imports = [...readFileSync(absolute, 'utf8').matchAll(/\b(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)]
    const found: string[] = []
    for (const match of imports) {
      const specifier = match[1] ?? match[2] ?? ''
      if (!specifier.startsWith('.')) continue
      const base = resolve(dirname(absolute), specifier)
      const target = [base, `${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
      if (target) found.push(rel(target))
    }
    return found
  }

  it('hashes every file that calls an emergency resolver and everything those files import directly', () => {
    const sources = listed()
    const gate = gateFiles()
    const needed = new Set(gate)
    for (const file of gate) for (const dependency of directImports(file)) needed.add(dependency)
    const unhashed = [...needed].filter((path) => !sources.includes(path)).sort()
    expect(gate.length, pillarWhy(PILLAR, 'the scan found the known callers (turn, create, evidence, confirm, assistant, the gate and its classifier)')).toBeGreaterThanOrEqual(7)
    expect(unhashed, pillarWhy(PILLAR, 'a file the emergency gate depends on is not in the hashed set, so changing it would not change source_tree_hash')).toEqual([])
  })

  it('hashes the whole transitive import closure of the emergency classifier, so the routing it decides is fully bound to the hash', () => {
    const sources = listed()
    const closure = new Set<string>()
    const visit = (file: string) => {
      if (closure.has(file)) return
      closure.add(file)
      for (const dependency of directImports(file)) visit(dependency)
    }
    visit('supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts')
    visit('supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-signal-text.ts')
    expect(closure.size, pillarWhy(PILLAR, 'the classifier stays a small self-contained unit; a new import is a new thing the hash must cover or the claim must be narrowed')).toBeLessThanOrEqual(4)
    expect([...closure].filter((path) => !sources.includes(path)), pillarWhy(PILLAR, 'a classifier dependency outside the hashed set would change routing without changing source_tree_hash')).toEqual([])
  })

  it('states in the evaluator source what the hash does and does not bind, so a report is not read as more than that', () => {
    const source = readFileSync(scriptPath, 'utf8')
    const comment = source.slice(0, source.indexOf('const SOURCE_FILES')).replace(/\r?\n\/\/ ?/g, ' ')
    expect(comment, pillarWhy(PILLAR, 'the scope statement sits directly above the list it describes')).toContain('source_tree_hash binds the bytes of the files listed here and nothing else')
    expect(comment, pillarWhy(PILLAR, 'the limits are named, not implied')).toContain('not the transitive import closure')
  })

  it('stays inside the manifest limit, with the service playbook as the one extra path', () => {
    expect(listed().length + 1, pillarWhy(PILLAR, 'the run manifest accepts at most 100 source files; going past it needs an approved contract change, not a silent trim')).toBeLessThanOrEqual(100)
  })

  it('lists only files that exist, so a rename cannot silently shrink the hashed tree', () => {
    for (const path of listed()) {
      expect(existsSync(resolve(repoRoot, path)), pillarWhy(PILLAR, `${path} is hashed into every evaluation report`)).toBe(true)
    }
  })

  describe('source_tree_hash is sensitive to what it covers', () => {
    const playbook = 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/electrical.ts'
    const files = normalizeSourceFiles([...listed(), playbook])
    const texts = new Map(files.map((path) => [path, readFileSync(resolve(repoRoot, path), 'utf8')]))
    const read = (overrides: Record<string, string | undefined> = {}) => (path: string) =>
      (path in overrides ? overrides[path] : texts.get(path)) ?? ''
    const base = computeSourceTreeHash(files, read())

    it('changes when any single byte of any hashed file changes', () => {
      const unchanged = files.filter((path) => computeSourceTreeHash(files, read({ [path]: `${texts.get(path)}\n` })) === base)
      expect(unchanged, pillarWhy(PILLAR, 'a hashed file whose edit leaves the hash as it was')).toEqual([])
    })

    it('changes when a hashed file is renamed, removed or added', () => {
      const renamed = files.map((path) => (path === files[0] ? `${path}.moved` : path))
      expect(computeSourceTreeHash(renamed, (path: string) => texts.get(path.replace('.moved', '')) ?? ''), pillarWhy(PILLAR, 'rename')).not.toBe(base)
      expect(computeSourceTreeHash(files.slice(1), read()), pillarWhy(PILLAR, 'removal')).not.toBe(base)
      expect(computeSourceTreeHash([...files, 'apps/api/scripts/extra.mjs'], (path: string) => (path === 'apps/api/scripts/extra.mjs' ? 'x' : texts.get(path) ?? '')), pillarWhy(PILLAR, 'addition')).not.toBe(base)
    })

    it('does not change with the order of the list or with a repeated path', () => {
      expect(computeSourceTreeHash([...files].reverse(), read()), pillarWhy(PILLAR, 'order')).toBe(base)
      expect(computeSourceTreeHash([...files, files[0] ?? ''], read()), pillarWhy(PILLAR, 'repeat')).toBe(base)
    })

    it('is exactly sha256 over each path and file sha256 joined by newlines, the algorithm the manifest names', () => {
      const sha = (value: string) => createHash('sha256').update(value).digest('hex')
      const expected = sha(files.map((path) => `${path}\n${sha(texts.get(path) ?? '')}`).join('\n'))
      expect(base, pillarWhy(PILLAR, 'sha256_path_and_file_sha256_v1')).toBe(expected)
    })

    it('does not mix up two files whose text is swapped', () => {
      const [first, second] = files
      const swapped = computeSourceTreeHash(files, read({ [first ?? '']: texts.get(second ?? ''), [second ?? '']: texts.get(first ?? '') }))
      expect(swapped, pillarWhy(PILLAR, 'the hash binds each text to its own path')).not.toBe(base)
    })
  })
})
