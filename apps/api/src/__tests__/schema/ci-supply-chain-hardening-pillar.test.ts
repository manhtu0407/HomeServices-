import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '../..')
const workflowNames = ['comment-discipline.yml', 'integration.yml', 'security.yml']

describe('CI supply-chain hardening', () => {
  it.each(workflowNames)('%s pins every remote action to a full commit SHA', (name) => {
    const workflow = readFileSync(resolve(root, '.github/workflows', name), 'utf8')
    const remoteActions = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)]

    expect(remoteActions.length).toBeGreaterThan(0)
    for (const [, action] of remoteActions) {
      expect(action, `${name}: ${action}`).toMatch(/^[^/\s]+\/[^@\s]+@[a-f0-9]{40}$/)
    }
  })

  it.each(workflowNames)('%s does not persist checkout credentials', (name) => {
    const workflow = readFileSync(resolve(root, '.github/workflows', name), 'utf8')
    const checkoutSteps = workflow.split(/^\s*- uses: /m).slice(1).filter((step) => step.startsWith('actions/checkout@'))

    expect(checkoutSteps.length).toBeGreaterThan(0)
    for (const step of checkoutSteps) {
      expect(step).toMatch(/persist-credentials:\s*false/)
    }
  })

  it('does not path-allowlist files from secret scanning', () => {
    const config = readFileSync(resolve(root, 'config/security/gitleaks.toml'), 'utf8')

    expect(config).not.toMatch(/^paths\s*=/m)
    expect(config).toContain('regexes = [')
  })
})
