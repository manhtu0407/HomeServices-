import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('local workspace tooling', () => {
  it('keeps the in-repo sandbox visible to fresh checkouts', () => {
    const ignorePatterns = read('.gitignore')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))

    expect(ignorePatterns).not.toContain('/sandbox/')
    expect(existsSync(resolve(root, 'sandbox/agent/package.json'))).toBe(true)
    expect(existsSync(resolve(root, 'sandbox/agent/src/sandbox-check.mjs'))).toBe(true)
  })

  it('launches through repository wrappers instead of a machine-specific pnpm path', () => {
    const launchSource = read('.claude/launch.json')
    const launch = JSON.parse(launchSource) as {
      configurations: Array<{ runtimeArgs: string[]; runtimeExecutable: string }>
    }

    expect(launchSource).not.toMatch(/[A-Za-z]:\\(?:tmp|Users)\\/i)
    for (const configuration of launch.configurations) {
      expect(configuration.runtimeExecutable).toBe('powershell.exe')
      expect(configuration.runtimeArgs).toContain('-File')
      expect(configuration.runtimeArgs.some((argument) => argument.startsWith('scripts/run-'))).toBe(true)
    }
  })
})
