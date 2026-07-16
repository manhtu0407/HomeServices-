import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../../')
const scriptPath = resolve(repoRoot, 'scripts/check-comment-discipline.mjs')
const sandboxes: string[] = []

function createRepo(source = 'export const value = 1\n'): string {
  const cwd = mkdtempSync(join(tmpdir(), 'nestscout-comment-discipline-'))
  sandboxes.push(cwd)
  mkdirSync(join(cwd, 'apps'), { recursive: true })
  writeFileSync(join(cwd, 'apps/example.ts'), source)
  execFileSync('git', ['init', '--quiet'], { cwd })
  execFileSync('git', ['config', 'user.email', 'tooling-test@example.invalid'], { cwd })
  execFileSync('git', ['config', 'user.name', 'Tooling Test'], { cwd })
  execFileSync('git', ['add', '.'], { cwd })
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd })
  return cwd
}

function runScript(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

describe('comment-discipline tooling', () => {
  it('tracks block-comment state outside a zero-context added-line hunk', () => {
    const cwd = createRepo([
      'export const value = 1',
      '/*',
      ' * durable explanation',
      ' */',
      '',
    ].join('\n'))
    writeFileSync(join(cwd, 'apps/example.ts'), [
      'export const value = 1',
      '/*',
      ' * fixed by Codex',
      ' */',
      '',
    ].join('\n'))

    const result = runScript(cwd, '--working')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('AI self-attribution')
    expect(result.stderr).toContain('apps/example.ts')
  })

  it('treats the diff ref as a Git argument instead of executable shell text', () => {
    const cwd = createRepo()
    const marker = join(cwd, 'tooling-comment-injected')
    const maliciousRef = 'HEAD && echo injected > tooling-comment-injected && echo'

    const result = runScript(cwd, '--diff', maliciousRef)

    expect(result.status).toBe(2)
    expect(existsSync(marker)).toBe(false)
  })

  it('scans modern TypeScript module extensions in untracked files', () => {
    const cwd = createRepo()
    writeFileSync(join(cwd, 'apps/release-config.cts'), '// Fixed by Codex\nexport {}\n')

    const result = runScript(cwd, '--working')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('apps/release-config.cts')
  })

  it('applies the same ratchet to root tooling scripts', () => {
    const cwd = createRepo()
    mkdirSync(join(cwd, 'scripts'))
    writeFileSync(join(cwd, 'scripts/tooling.mjs'), '// Fixed by Codex\nexport {}\n')

    const result = runScript(cwd, '--working')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('scripts/tooling.mjs')
  })
})
