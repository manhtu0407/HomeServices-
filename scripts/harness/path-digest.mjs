import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function digestPath(rootInput, pathInput) {
  const root = resolve(rootInput)
  const target = resolve(root, pathInput)
  const localTarget = relative(root, target)
  if (!localTarget || localTarget.startsWith('..')) throw new Error('digest target escapes its declared root')
  const files = collectRegularFiles(target)
  if (files.length === 0) throw new Error('digest target has no regular files')
  const hash = createHash('sha256')
  for (const file of files) {
    const local = relative(target, file).replaceAll('\\', '/') || file.split(/[\\/]/u).at(-1)
    hash.update(`${local}\0`)
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function collectRegularFiles(target) {
  const metadata = lstatSync(target)
  if (metadata.isSymbolicLink()) throw new Error('digest target may not contain symbolic links')
  if (metadata.isFile()) return [target]
  if (!metadata.isDirectory()) throw new Error('digest target is not a regular file or directory')
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('digest target may not contain symbolic links')
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error('digest target contains a non-regular entry')
    }
  }
  walk(target)
  return files
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const rootIndex = process.argv.indexOf('--root')
    const pathIndex = process.argv.indexOf('--path')
    const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd()
    const path = pathIndex >= 0 ? process.argv[pathIndex + 1] : null
    if (!root || !path) throw new Error('path-digest requires --root and --path')
    process.stdout.write(`${digestPath(root, path)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
