import { describe, expect, it } from 'vitest'
import { changedPathsFromPorcelainV1Z } from '../../../../../scripts/lib/git-status.mjs'

describe('tooling git status parser', () => {
  it.each([
    [' M apps/mobile/lib/example.ts\0', ['apps/mobile/lib/example.ts']],
    ['M  apps/mobile/lib/example.ts\0', ['apps/mobile/lib/example.ts']],
    ['?? apps/mobile/lib/example.ts\0', ['apps/mobile/lib/example.ts']],
  ])('preserves the complete path for %j', (status, expected) => {
    expect(changedPathsFromPorcelainV1Z(status)).toEqual(expected)
  })

  it('returns the destination path once for a rename record', () => {
    expect(changedPathsFromPorcelainV1Z(
      'R  apps/mobile/lib/new-name.ts\0apps/mobile/lib/old-name.ts\0',
    )).toEqual(['apps/mobile/lib/new-name.ts'])
  })
})
