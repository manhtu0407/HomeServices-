import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const domainsRoot = fileURLToPath(
  new URL('../../../../../supabase/functions/mobile-api/_shared/domains/', import.meta.url),
)

const listTypeScriptFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry)
  return statSync(path).isDirectory()
    ? listTypeScriptFiles(path)
    : path.endsWith('.ts') ? [path] : []
})

describe('mobile-api domain module layout', () => {
  it('keeps job and matching modules within the split size boundary', () => {
    const splitModulePaths = ['job', 'matching'].flatMap((directory) =>
      listTypeScriptFiles(join(domainsRoot, directory)),
    )
    for (const path of splitModulePaths) {
      const source = readFileSync(path, 'utf8')
      expect(source.trimEnd().split(/\r?\n/).length, relative(domainsRoot, path)).toBeLessThanOrEqual(300)
    }
  })
})
