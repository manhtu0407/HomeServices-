import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const TEST_FILE = /(^|\/)__tests__\/|[.-]test\.[cm]?[jt]sx?$/

const git = (args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
  stdio: ['ignore', 'pipe', 'pipe'],
})

export function parseUnifiedDiff(raw) {
  const files = []
  let current = null
  let inHunk = false
  let oldPath = null
  let newLine = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      inHunk = false
      continue
    }
    if (!inHunk) {
      if (line.startsWith('--- ')) {
        oldPath = line.slice(4).replace(/^a\//, '')
      } else if (line.startsWith('+++ ')) {
        const target = line.slice(4)
        const deleted = target === '/dev/null'
        current = { path: deleted ? oldPath : target.replace(/^b\//, ''), added: [], removed: [], deleted }
        files.push(current)
      } else if (line.startsWith('@@')) {
        inHunk = true
        newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0)
      }
      continue
    }
    if (line.startsWith('@@')) {
      newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0)
      continue
    }
    if (!current) continue
    if (line.startsWith('+')) {
      current.added.push({ line: newLine, text: line.slice(1) })
      newLine += 1
    } else if (line.startsWith('-')) {
      current.removed.push(line.slice(1))
    }
  }
  return files
}

function readDisk(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function untrackedFiles() {
  return git(['ls-files', '-z', '--others', '--exclude-standard']).split('\0').filter(Boolean)
}

function wholeFileAsAdded(path, content) {
  const lines = content.split('\n')
  return { path, added: lines.map((text, index) => ({ line: index + 1, text })), removed: [], content }
}

export function collectChanges({ mode, ref }) {
  if (mode === 'working') {
    const changed = parseUnifiedDiff(git(['diff', '--unified=0', '--no-color', 'HEAD', '--']))
    const tracked = new Set(changed.map((file) => file.path))
    const untracked = untrackedFiles()
      .filter((path) => !tracked.has(path))
      .map((path) => {
        const content = readDisk(path)
        return content === null ? null : wholeFileAsAdded(path, content)
      })
      .filter(Boolean)
    return [...changed.map((file) => ({ ...file, content: readDisk(file.path) })), ...untracked]
  }
  if (mode === 'ref') {
    const base = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim()
    return parseUnifiedDiff(git(['diff', '--unified=0', '--no-color', `${base}...HEAD`, '--']))
      .map((file) => ({ ...file, content: readDisk(file.path) }))
  }
  if (mode === 'rev') {
    const sha = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim()
    return parseUnifiedDiff(git(['diff', '--unified=0', '--no-color', `${sha}^`, sha, '--']))
      .map((file) => {
        let content = null
        try {
          content = git(['show', `${sha}:${file.path}`])
        } catch {
          content = null
        }
        return { ...file, content }
      })
  }
  throw new Error(`unknown mode: ${mode}`)
}

export function argValue(args, flag) {
  const index = args.indexOf(flag)
  return index === -1 ? null : args[index + 1] ?? null
}

export function selectMode(args) {
  if (args.includes('--working')) return { mode: 'working' }
  const ref = argValue(args, '--diff')
  if (ref) return { mode: 'ref', ref }
  const rev = argValue(args, '--rev')
  if (rev) return { mode: 'rev', ref: rev }
  return null
}
