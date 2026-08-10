import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  checkHarnessManifest,
  gitBlobSha1,
  manifestSha256,
} from './check-manifest.mjs'

const schemaSource = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/harness/manifest.schema.json',
)

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function writeJson(path, value) {
  write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function createFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-manifest-'))
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'core.autocrlf', 'true'], { cwd: root })
  const skill = '---\nname: alpha\ndescription: Fixture skill.\n---\n\n# alpha\n'
  const runtimeTool = 'export function readKnowledge() { return true }\n'
  write(resolve(root, '.claude/skills/alpha/SKILL.md'), skill)
  write(resolve(root, '.agents/skills/alpha/SKILL.md'), skill)
  write(resolve(root, 'supabase/functions/mobile-api/_shared/kael/tools/knowledge.ts'), runtimeTool)
  write(
    resolve(root, 'CLAUDE.md'),
    [
      'Two groups, 1 total.',
      '',
      '**Everyday (1).**',
      '',
      '```text',
      'alpha',
      '```',
      '',
      '**Design (0).**',
      '',
      '```text',
      '```',
      '',
    ].join('\n'),
  )
  write(
    resolve(root, 'AGENTS.md'),
    'Two groups, 1 total: **Everyday (1)** and **Design (0)**.\n',
  )
  write(
    resolve(root, 'config/harness/manifest.schema.json'),
    readFileSync(schemaSource),
  )
  const manifest = {
    $schema: './manifest.schema.json',
    manifestVersion: '1.0.0',
    checksumAlgorithm: 'git-blob-sha1',
    inventory: {
      repositorySkillRoot: '.claude/skills',
      repositorySkillEntryFile: 'SKILL.md',
      repositorySkillMirrorRoot: '.agents/skills',
      runtimeToolRoots: ['supabase/functions/mobile-api/_shared/kael/tools'],
    },
    routers: [
      { path: 'CLAUDE.md', mode: 'canonical-skill-list' },
      { path: 'AGENTS.md', mode: 'skill-count-pointer' },
    ],
    entries: [
      {
        id: 'alpha',
        version: '1.0.0',
        group: 'everyday',
        owner: 'repository-governance',
        purpose: 'Exercise repository manifest validation.',
        trigger: 'A test needs a repository skill fixture.',
        kind: 'repository-skill',
        canonicalPath: '.claude/skills/alpha/SKILL.md',
        mirroredPath: '.agents/skills/alpha/SKILL.md',
        allowedEnvironments: ['local'],
        inputSchema: 'urn:test:skill-input:v1',
        outputSchema: 'urn:test:skill-output:v1',
        sideEffectClass: 'none',
        requiredCapability: 'repository.read',
        timeoutMs: 1000,
        retryClass: 'none',
        budgetClass: 'none',
        dataClasses: ['repository-source'],
        redactionProfile: 'repository-safe',
        deprecated: false,
        checksum: `git-blob-sha1:${gitBlobSha1(skill)}`,
      },
      {
        id: 'runtime.knowledge',
        version: '1.0.0',
        group: 'runtime',
        owner: 'ai-runtime',
        purpose: 'Exercise runtime tool inventory validation.',
        trigger: 'A test needs a runtime tool fixture.',
        kind: 'runtime-tool',
        canonicalPath: 'supabase/functions/mobile-api/_shared/kael/tools/knowledge.ts',
        allowedEnvironments: ['local'],
        inputSchema: 'urn:test:runtime-input:v1',
        outputSchema: 'urn:test:runtime-output:v1',
        sideEffectClass: 'read-only',
        requiredCapability: 'knowledge.read',
        timeoutMs: 1000,
        retryClass: 'none',
        budgetClass: 'none',
        dataClasses: ['internal-operational-metadata'],
        redactionProfile: 'repository-safe',
        deprecated: false,
        checksum: `git-blob-sha1:${gitBlobSha1(runtimeTool)}`,
      },
    ],
  }
  writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
  return { root, manifest }
}

function withFixture(run) {
  const fixture = createFixture()
  try {
    return run(fixture)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
}

test('accepts a complete semantic inventory', () => {
  withFixture(({ root }) => {
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, true, report.problems.join('\n'))
    assert.equal(report.skillCount, 1)
    assert.equal(report.runtimeToolCount, 1)
  })
})

test('discovers a linked canonical skill directory', () => {
  withFixture(({ root }) => {
    const canonical = resolve(root, '.claude/skills/alpha')
    const target = resolve(root, '.scratch/linked-alpha')
    mkdirSync(dirname(target), { recursive: true })
    renameSync(canonical, target)
    symlinkSync(target, canonical, process.platform === 'win32' ? 'junction' : 'dir')

    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, true, report.problems.join('\n'))
  })
})

test('rejects duplicate stable identifiers', () => {
  withFixture(({ root, manifest }) => {
    manifest.entries.push({ ...manifest.entries[0] })
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('duplicate entry id: alpha')))
  })
})

test('rejects a missing canonical path', () => {
  withFixture(({ root, manifest }) => {
    manifest.entries[0].canonicalPath = '.claude/skills/missing/SKILL.md'
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('missing canonical path for alpha')))
  })
})

test('rejects canonical checksum drift', () => {
  withFixture(({ root }) => {
    write(resolve(root, '.claude/skills/alpha/SKILL.md'), '---\nname: alpha\n---\nchanged\n')
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('checksum drift for alpha')))
  })
})

test('rejects human router count drift', () => {
  withFixture(({ root }) => {
    write(resolve(root, 'AGENTS.md'), 'Two groups, 2 total: **Everyday (2)** and **Design (0)**.\n')
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('router AGENTS.md total drift')))
  })
})

test('accepts declared provider adapters in the runtime inventory', () => {
  withFixture(({ root, manifest }) => {
    const provider = 'export function callProvider() { return true }\n'
    const path = 'supabase/functions/mobile-api/_shared/kael/tools/provider.ts'
    write(resolve(root, path), provider)
    manifest.entries.push({
      id: 'provider.fixture',
      version: '1.0.0',
      group: 'runtime',
      owner: 'ai-runtime',
      purpose: 'Exercise provider-adapter inventory validation.',
      trigger: 'A test needs a provider adapter fixture.',
      kind: 'provider-adapter',
      canonicalPath: path,
      allowedEnvironments: ['local'],
      inputSchema: 'urn:test:provider-input:v1',
      outputSchema: 'urn:test:provider-output:v1',
      sideEffectClass: 'non-repeatable',
      requiredCapability: 'provider.call',
      timeoutMs: 1000,
      retryClass: 'none',
      budgetClass: 'provider-low',
      dataClasses: ['provider-request-metadata'],
      redactionProfile: 'repository-safe',
      deprecated: false,
      checksum: `git-blob-sha1:${gitBlobSha1(provider)}`,
    })
    manifest.entries.sort((left, right) => left.group === right.group
      ? left.id.localeCompare(right.id)
      : ({ everyday: 0, design: 1, runtime: 2 }[left.group] - { everyday: 0, design: 1, runtime: 2 }[right.group]))
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, true, report.problems.join('\n'))
    assert.equal(report.providerAdapterCount, 1)
    assert.equal(report.runtimeEntryCount, 2)
  })
})

test('rejects duplicate skill identifiers in the canonical router', () => {
  withFixture(({ root }) => {
    write(
      resolve(root, 'CLAUDE.md'),
      [
        'Two groups, 1 total.',
        '',
        '**Everyday (1).**',
        '',
        '```text',
        'alpha alpha',
        '```',
        '',
        '**Design (0).**',
        '',
        '```text',
        '```',
        '',
      ].join('\n'),
    )
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('Everyday list contains duplicates: alpha')))
  })
})

test('requires runtime group for provider adapters', () => {
  withFixture(({ root, manifest }) => {
    const provider = 'export function callProvider() { return true }\n'
    const path = 'supabase/functions/mobile-api/_shared/kael/tools/provider.ts'
    write(resolve(root, path), provider)
    manifest.entries.push({
      id: 'provider.fixture',
      version: '1.0.0',
      group: 'everyday',
      owner: 'ai-runtime',
      purpose: 'Exercise provider-adapter group validation.',
      trigger: 'A test needs an invalid provider adapter group.',
      kind: 'provider-adapter',
      canonicalPath: path,
      allowedEnvironments: ['local'],
      inputSchema: 'urn:test:provider-input:v1',
      outputSchema: 'urn:test:provider-output:v1',
      sideEffectClass: 'non-repeatable',
      requiredCapability: 'provider.call',
      timeoutMs: 1000,
      retryClass: 'none',
      budgetClass: 'provider-low',
      dataClasses: ['provider-request-metadata'],
      redactionProfile: 'repository-safe',
      deprecated: false,
      checksum: `git-blob-sha1:${gitBlobSha1(provider)}`,
    })
    manifest.entries.sort((left, right) => left.group === right.group
      ? left.id.localeCompare(right.id)
      : ({ everyday: 0, design: 1, runtime: 2 }[left.group] - { everyday: 0, design: 1, runtime: 2 }[right.group]))
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('provider-adapter provider.fixture must use runtime group')))
  })
})

test('requires a capability for side-effecting entries', () => {
  withFixture(({ root, manifest }) => {
    manifest.entries[1].sideEffectClass = 'conditional-write'
    manifest.entries[1].requiredCapability = null
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('side-effecting entry runtime.knowledge requires a capability')))
  })
})

test('rejects undeclared runtime tools', () => {
  withFixture(({ root }) => {
    write(
      resolve(root, 'supabase/functions/mobile-api/_shared/kael/tools/undeclared.ts'),
      'export const undeclared = true\n',
    )
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('runtime tool inventory has undeclared entries')))
  })
})

test('rejects schema-level required field drift', () => {
  withFixture(({ root, manifest }) => {
    delete manifest.entries[0].owner
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('missing required field: owner')))
  })
})

test('uses Git clean filters for cross-platform checksums', () => {
  withFixture(({ root }) => {
    const skillPath = resolve(root, '.claude/skills/alpha/SKILL.md')
    const mirrorPath = resolve(root, '.agents/skills/alpha/SKILL.md')
    const crlf = readFileSync(skillPath, 'utf8').replace(/\n/g, '\r\n')
    write(skillPath, crlf)
    write(mirrorPath, crlf)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, true, report.problems.join('\n'))
  })
})

test('rejects unknown inventory fields from the schema contract', () => {
  withFixture(({ root, manifest }) => {
    manifest.inventory.untrackedRoot = 'other/tools'
    writeJson(resolve(root, 'config/harness/manifest.json'), manifest)
    const report = checkHarnessManifest({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('inventory has unknown field: untrackedRoot')))
  })
})

test('canonical manifest hash is independent of object key order', () => {
  const left = { b: 2, a: { d: 4, c: 3 }, list: [{ y: 2, x: 1 }] }
  const right = { list: [{ x: 1, y: 2 }], a: { c: 3, d: 4 }, b: 2 }
  assert.equal(manifestSha256(left), manifestSha256(right))
})
