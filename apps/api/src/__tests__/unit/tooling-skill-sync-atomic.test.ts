import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { syncSkills } from '../../../../../scripts/sync-skills.mjs'

const sandboxes: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'nestscout-skill-sync-'))
  sandboxes.push(root)
  const canonical = join(root, 'canonical')
  const mirror = join(root, 'mirror')
  mkdirSync(canonical)
  mkdirSync(mirror)
  writeFileSync(join(canonical, 'SKILL.md'), 'new skill\n')
  writeFileSync(join(mirror, 'SKILL.md'), 'old skill\n')
  return { canonical, mirror }
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true })
})

describe('atomic skill mirroring', () => {
  it('installs the complete canonical tree and removes stale mirror files', () => {
    const { canonical, mirror } = fixture()
    writeFileSync(join(mirror, 'stale.md'), 'stale\n')

    syncSkills(canonical, mirror)

    expect(readFileSync(join(mirror, 'SKILL.md'), 'utf8')).toBe('new skill\n')
    expect(existsSync(join(mirror, 'stale.md'))).toBe(false)
  })

  it('materializes canonical junction targets before replacing their mirror', () => {
    const { canonical, mirror } = fixture()
    mkdirSync(join(mirror, 'shared-skill'))
    writeFileSync(join(mirror, 'shared-skill/SKILL.md'), 'shared skill\n')
    symlinkSync(join(mirror, 'shared-skill'), join(canonical, 'shared-skill'), 'junction')

    syncSkills(canonical, mirror)

    expect(readFileSync(join(mirror, 'shared-skill/SKILL.md'), 'utf8')).toBe('shared skill\n')
    expect(readFileSync(join(canonical, 'shared-skill/SKILL.md'), 'utf8')).toBe('shared skill\n')
  })

  it('restores the previous mirror when installing the staged copy fails', () => {
    const { canonical, mirror } = fixture()
    let renameCalls = 0

    expect(() => syncSkills(canonical, mirror, {
      rename(source: string, destination: string) {
        renameCalls += 1
        if (renameCalls === 2) throw new Error('simulated install failure')
        renameSync(source, destination)
      },
    })).toThrow('simulated install failure')

    expect(readFileSync(join(mirror, 'SKILL.md'), 'utf8')).toBe('old skill\n')
  })
})
