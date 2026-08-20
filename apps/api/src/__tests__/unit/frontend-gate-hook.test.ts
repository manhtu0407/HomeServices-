import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const HOOK_SOURCE = readFileSync(
  resolve(__dirname, '../../../../../.claude/hooks/verify-frontend-gates.mjs'),
  'utf-8',
)
const CLAUDE_SETTINGS = readFileSync(
  resolve(__dirname, '../../../../../.claude/settings.json'),
  'utf-8',
)
const COMMENT_HOOK_SOURCE = readFileSync(
  resolve(__dirname, '../../../../../.claude/hooks/verify-comment-hygiene.mjs'),
  'utf-8',
)

describe('frontend Stop hook guardrails', () => {
  it('does not let stop_hook_active bypass red frontend gates', () => {
    expect(HOOK_SOURCE).toContain('stop_hook_active')
    expect(HOOK_SOURCE).not.toContain('if (input.stop_hook_active)')
    expect(HOOK_SOURCE).not.toContain('stop_hook_active) allowStop')
  })

  it('treats mobile config and package metadata changes as gate-relevant', () => {
    expect(HOOK_SOURCE).toContain('MOBILE_GATE_PATH_PATTERN')
    expect(HOOK_SOURCE).toContain('package\\.json')
    expect(HOOK_SOURCE).toContain('tsconfig')
    expect(HOOK_SOURCE).toContain('eslint\\.config')
    expect(HOOK_SOURCE).toContain('app\\.json')
    expect(HOOK_SOURCE).toContain('eas\\.json')
  })

  // 99a5e76d moved every Stop hook off the direct PowerShell invocation onto scripts/run.mjs,
  // which dispatches by platform. The invariant is unchanged — a hook launches through a
  // wrapper, never through a shell-interpolated path or a .cmd — only the wrapper moved.
  it('launches Stop hooks through the cross-platform runner, never a raw shell path', () => {
    expect(CLAUDE_SETTINGS).toContain('scripts/run.mjs')
    expect(CLAUDE_SETTINGS).toContain('run-node')
    expect(CLAUDE_SETTINGS).not.toContain('scripts/run-node.cmd')
  })

  it('runs mobile gates through argument arrays and the pinned package wrapper', () => {
    expect(HOOK_SOURCE).toContain("join(projectDir, 'scripts', 'run-package-script.ps1')")
    expect(HOOK_SOURCE).toContain("execFileSync('git', ['status', '--porcelain=v1', '-z', '--', 'apps/mobile']")
    expect(HOOK_SOURCE).toContain("execFileSync(powershell, [...powerShellArgs, '-File', gateRunner")
    expect(HOOK_SOURCE).not.toContain("execSync('git status")
    expect(HOOK_SOURCE).not.toContain("execFileSync('pnpm'")
  })

  it('runs comment hygiene without shell interpolation and with a bounded large buffer', () => {
    expect(COMMENT_HOOK_SOURCE).toContain(
      "execFileSync(process.execPath, [linter, '--working']",
    )
    expect(COMMENT_HOOK_SOURCE).toContain('maxBuffer: 1 << 28')
    expect(COMMENT_HOOK_SOURCE).not.toContain('execSync(`"${process.execPath}"')
  })

  it('includes root scripts and hook code in the comment-hygiene ratchet', () => {
    expect(COMMENT_HOOK_SOURCE).toContain("'scripts', '.claude/hooks'")
    expect(COMMENT_HOOK_SOURCE).toContain('scripts|\\.claude\\/hooks')
  })
})
