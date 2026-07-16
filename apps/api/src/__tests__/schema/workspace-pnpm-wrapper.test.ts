import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '../..')
const helperPath = resolve(root, 'scripts/resolve-workspace-pnpm.ps1')
const helper = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : ''
const turboScript = readFileSync(resolve(root, 'scripts/run-turbo.ps1'), 'utf8')

describe('workspace pnpm wrapper', () => {
  it('pins workspace commands to the packageManager version', () => {
    expect(helper).toContain('packageManager')
    expect(helper).toContain('pnpm@$expectedVersion')
    expect(helper).toContain('Get-WorkspacePnpmInvocation')
    expect(helper).toMatch(/actualVersion[\s\S]+expectedVersion/)
  })

  it.each(['run-package-script.ps1', 'run-supabase.ps1', 'run-turbo.ps1'])(
    '%s uses the version-aware resolver',
    (scriptName) => {
      const script = readFileSync(resolve(root, 'scripts', scriptName), 'utf8')
      expect(script).toContain('resolve-workspace-pnpm.ps1')
      expect(script).toContain('Get-WorkspacePnpmInvocation')
    },
  )

  it('routes every Turbo execution through the version-aware pnpm invocation', () => {
    const resolverIndex = turboScript.indexOf('$pnpmInvocation = Get-WorkspacePnpmInvocation')
    const argsIndex = turboScript.indexOf('$pnpmArgs = @($pnpmInvocation.Prefix)')
    const invocationIndex = turboScript.indexOf('& $pnpmInvocation.Command @pnpmArgs')
    const processInvocations = turboScript
      .split(/\r?\n/)
      .filter((line) => /^[ \t]*&[ \t]+/.test(line))

    expect(resolverIndex).toBeGreaterThan(-1)
    expect(argsIndex).toBeGreaterThan(resolverIndex)
    expect(invocationIndex).toBeGreaterThan(argsIndex)
    expect(processInvocations).toEqual(['  & $pnpmInvocation.Command @pnpmArgs'])
  })
})
