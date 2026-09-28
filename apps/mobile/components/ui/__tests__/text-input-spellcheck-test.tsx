import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Browser and keyboard spell checkers read Vietnamese as misspelled English and underline every
// word in red, so every text field in the app turns spell checking off.
function sources(root: string): { path: string; source: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path)
    return entry.name.endsWith('.tsx') ? [{ path: relative(process.cwd(), path).split('\\').join('/'), source: readFileSync(path, 'utf8') }] : []
  })
}

describe('text inputs', () => {
  it('turn spell checking off wherever a TextInput is rendered', () => {
    const offenders = [...sources(join(process.cwd(), 'components')), ...sources(join(process.cwd(), 'app'))]
      .flatMap(({ path, source }) => [...source.matchAll(/<TextInput\s[^>]*/g)]
        .filter((match) => !/spellCheck=\{false\}/.test(match[0]))
        .map(() => path))
    expect(offenders).toEqual([])
  })
})
