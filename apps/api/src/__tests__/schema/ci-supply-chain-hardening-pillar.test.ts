import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P194-ci-supply-chain-hardening',
  invariant:
    'every workflow runs third-party actions only when pinned to a full commit SHA, no checkout leaves its token in the workspace, and the secret scan reads full history, skips no path, and runs on every pull request and push',
  authority: [
    'governance/RULES.md Security Invariants — Secrets Management (a committed secret is a leaked secret, so the scan must not skip paths)',
    'governance/protocols/ai-data-security.md §15 (kael-security-sweep: credential handling)',
  ],
  target: '.github/workflows',
  layer: 'security-negative',
  siblings: ['P56-stage1-production-release-workflow', 'P53-stage1-release-integrity'],
  mutation:
    'replace the 40-hex SHA of any `uses:` in any workflow with a tag such as `v4`, or delete one `persist-credentials: false` from any checkout — exactly the case named for that workflow turns red and no other case in this pillar moves, including for ci and both release lanes',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../..')
const workflowDirectory = resolve(root, '.github/workflows')
const workflowNames = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/u.test(name)).sort()

const readWorkflow = (name: string) => readFileSync(resolve(workflowDirectory, name), 'utf8')
const workflowUses = (workflow: string) =>
  [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map((match) => match[1])
const localReusableWorkflows = (workflow: string) =>
  workflowUses(workflow).filter((reference) => reference.startsWith('./.github/workflows/'))
const remoteActions = (workflow: string) =>
  workflowUses(workflow).filter((reference) => !reference.startsWith('./.github/workflows/'))

const PINNED_ACTION = /^[^/\s]+\/[^@\s]+@[a-f0-9]{40}$/u
const CHECKOUT = /^\s*(?:-\s*)?uses:\s*actions\/checkout@/u

const indentOf = (line: string) => line.length - line.trimStart().length

// The step that owns line `index`, from its `- ` marker to the line before the next step, so the
// answer does not depend on whether `uses:` is the step's first key.
function stepAt(lines: readonly string[], index: number): string {
  let start = index
  if (!/^\s*-\s/u.test(lines[index])) {
    const keyIndent = indentOf(lines[index])
    while (start > 0 && !(/^\s*-\s/u.test(lines[start]) && indentOf(lines[start]) < keyIndent)) start -= 1
  }
  const stepIndent = indentOf(lines[start])
  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > stepIndent)) end += 1
  return lines.slice(start, end).join('\n')
}

describe('CI supply-chain hardening', () => {
  it('finds workflows to guard and real actions and checkouts inside them', () => {
    expect(workflowNames.length, pillarWhy(PILLAR, 'no workflow file found; the guards below would pass over nothing')).toBeGreaterThan(0)
    const all = workflowNames.map(readWorkflow).join('\n')
    expect(remoteActions(all).length, pillarWhy(PILLAR, 'the action pattern matched nothing')).toBeGreaterThan(0)
    expect(all.split(/\r?\n/u).filter((line) => CHECKOUT.test(line)).length, pillarWhy(PILLAR, 'the checkout pattern matched nothing')).toBeGreaterThan(0)
  })

  it.each(workflowNames)('%s pins every remote action to a full commit SHA', (name) => {
    for (const action of remoteActions(readWorkflow(name))) {
      expect(action, pillarWhy(PILLAR, `${name}: ${action} is not a 40-hex commit SHA, so a moved tag would run new code`)).toMatch(PINNED_ACTION)
    }
  })

  it.each(workflowNames)('%s resolves local reusable workflows from the same source commit', (name) => {
    for (const reference of localReusableWorkflows(readWorkflow(name))) {
      expect(reference, pillarWhy(PILLAR, `${name}: local workflow references must stay inside .github/workflows`))
        .toMatch(/^\.\/\.github\/workflows\/[^/]+\.ya?ml$/u)
      expect(existsSync(resolve(root, reference)), pillarWhy(PILLAR, `${name}: local reusable workflow ${reference} is missing`))
        .toBe(true)
    }
  })

  it.each(workflowNames)('%s does not persist checkout credentials', (name) => {
    const lines = readWorkflow(name).split(/\r?\n/u)
    lines.forEach((line, index) => {
      if (!CHECKOUT.test(line)) return
      expect(
        stepAt(lines, index),
        pillarWhy(PILLAR, `${name} line ${index + 1}: this checkout keeps its token in .git/config for every later step`),
      ).toMatch(/persist-credentials:\s*false/u)
    })
  })

  it('runs the secret scan with full history on every pull request and push', () => {
    const security = readWorkflow('ci.yml')
    expect(security, pillarWhy(PILLAR, 'ci.yml no longer runs gitleaks')).toMatch(/uses:\s*gitleaks\/gitleaks-action@[a-f0-9]{40}/u)
    expect(security, pillarWhy(PILLAR, 'the scan must use the repository rule set')).toMatch(/GITLEAKS_CONFIG:\s*config\/security\/gitleaks\.toml/u)
    expect(security, pillarWhy(PILLAR, 'a shallow checkout hides the history the scan exists to read')).toMatch(/fetch-depth:\s*0/u)
    expect(security, pillarWhy(PILLAR, 'the scan must run on pull requests')).toMatch(/^\s+pull_request:/mu)
    expect(security, pillarWhy(PILLAR, 'the scan must run on pushes to main')).toMatch(/^\s+push:/mu)
  })

  it('does not path-allowlist files from secret scanning', () => {
    const config = readFileSync(resolve(root, 'config/security/gitleaks.toml'), 'utf8')
    expect(config, pillarWhy(PILLAR, 'a paths allowlist hides files from the scan')).not.toMatch(/^paths\s*=/m)
    expect(config, pillarWhy(PILLAR, 'the rule set must stay regex-based')).toContain('regexes = [')
  })
})
