import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const suiteRoot = fileURLToPath(new URL('../kael-edge-runtime/', import.meta.url))

const listTypeScriptFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry)
  return statSync(path).isDirectory()
    ? listTypeScriptFiles(path)
    : path.endsWith('.ts') ? [path] : []
})

describe('kael edge runtime suite layout', () => {
  it('keeps every split suite file within the size boundary', () => {
    for (const path of listTypeScriptFiles(suiteRoot)) {
      const source = readFileSync(path, 'utf8')
      expect(source.trimEnd().split(/\r?\n/).length, relative(suiteRoot, path)).toBeLessThanOrEqual(600)
    }
  })
})
