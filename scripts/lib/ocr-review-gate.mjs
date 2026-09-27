import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'

export const NUDGE_LINE_THRESHOLD = 30
export const BATCH_MAX_FILES = 8
export const BATCH_MAX_LINES = 800
export const OCR_PROCESS_TIMEOUT_MS = 120000

const SUPPORTED_SCHEMA = '1'
const RULE_CHUNK = 60
const NL = String.fromCharCode(10)

// Fixed identity and date make the snapshot a pure function of (tree, parent), so a repeated
// hook run over an unchanged tree produces the same commit id instead of a new one.
const SNAPSHOT_ENV = {
  GIT_AUTHOR_NAME: 'ocr-snapshot',
  GIT_AUTHOR_EMAIL: 'ocr-snapshot@localhost',
  GIT_COMMITTER_NAME: 'ocr-snapshot',
  GIT_COMMITTER_EMAIL: 'ocr-snapshot@localhost',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00+00:00',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00+00:00',
}

// Secret-shaped paths are removed from the private index and excluded from additions. The
// **/ form also matches root-level files and lets Git skip ignored .scratch contents.
const SNAPSHOT_OMITTED_GLOBS = [
  '**/.scratch/**',
  '**/.ssh/**',
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/id_rsa*',
  '**/.npmrc',
]
const SNAPSHOT_OMITTED_PATHS = SNAPSHOT_OMITTED_GLOBS.map((pattern) => `:(top,glob)${pattern}`)
const SNAPSHOT_EXCLUDES = SNAPSHOT_OMITTED_GLOBS.map((pattern) => `:(exclude,top,glob)${pattern}`)

export class OcrUnavailableError extends Error {}

// git prints unrelated warnings first (an unreadable global ignore file is common in a sandbox),
// so the first line of stderr is often not the failure. Warnings are dropped to expose the error.
export function gitErrorDetail(text) {
  const lines = String(text ?? '').split(NL).map((line) => line.trim()).filter((line) => line && !line.startsWith('warning:'))
  return lines.slice(0, 3).join(' | ') || 'no error output'
}

function gitRaw(cwd, args, env) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: env ? { ...process.env, ...env } : process.env,
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (error) {
    throw new Error(`git ${args[0]} failed: ${gitErrorDetail(error.stderr || error.message)}`)
  }
}

export function git(cwd, args, env) {
  return gitRaw(cwd, args, env).trim()
}

function gitOrNull(cwd, args, env) {
  try {
    return git(cwd, args, env) || null
  } catch {
    return null
  }
}

// Snapshot objects live in a private object directory under .scratch and are never written to the
// repository's own object database: an agent sandbox may deny writes to .git/objects (Codex does),
// and nothing then needs pruning or a Git Rule exception. Reading them is done through git's
// alternate-object mechanism, so every command that names a snapshot goes through sgit.
export const objectsDir = (root) => join(root, '.scratch', 'ocr', 'objects')

function withSnapshotObjects(root, env = {}) {
  const inherited = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
  return { ...env, GIT_ALTERNATE_OBJECT_DIRECTORIES: [inherited, objectsDir(root)].filter(Boolean).join(delimiter) }
}

export const sgit = (root, args, env) => git(root, args, withSnapshotObjects(root, env))
const sgitOrNull = (root, args, env) => gitOrNull(root, args, withSnapshotObjects(root, env))

export function diffFiles(cwd, { from, to, paths }) {
  const root = resolveRoot(cwd)
  return gitRaw(root, ['diff', from, to, '--', ...paths], withSnapshotObjects(root))
}

export function resolveRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel'])
}

export function describeRepo(root) {
  const gitDir = git(root, ['rev-parse', '--git-dir'])
  const commonDir = git(root, ['rev-parse', '--git-common-dir'])
  return {
    root,
    head: gitOrNull(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']),
    branch: gitOrNull(root, ['branch', '--show-current']) ?? 'HEAD',
    linkedWorktree: resolve(root, gitDir).toLowerCase() !== resolve(root, commonDir).toLowerCase(),
  }
}

const commitOf = (root, ref) => gitOrNull(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])

export function resolveBase(root, { explicit, stateBase } = {}) {
  if (explicit) {
    if (!commitOf(root, explicit)) throw new Error(`base ref not found: ${explicit}`)
    return explicit
  }
  for (const ref of [stateBase, 'origin/main', 'main']) {
    if (ref && commitOf(root, ref)) return ref
  }
  throw new Error('no base ref found: expected origin/main or main')
}

export function mergeBaseOf(root, base) {
  return gitOrNull(root, ['merge-base', base, 'HEAD'])
}

export function takeSnapshot(root, { parent } = {}) {
  const store = objectsDir(root)
  mkdirSync(store, { recursive: true })
  const dir = mkdtempSync(join(dirname(store), 'snap-'))
  const repoObjects = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])
  // New objects go to the private store; everything already in the repository is read through it.
  const env = { GIT_INDEX_FILE: join(dir, 'index'), GIT_OBJECT_DIRECTORY: store, GIT_ALTERNATE_OBJECT_DIRECTORIES: repoObjects }
  try {
    const head = commitOf(root, 'HEAD')
    if (head) git(root, ['read-tree', head], env)
    git(root, ['rm', '--cached', '--ignore-unmatch', '--', ...SNAPSHOT_OMITTED_PATHS], env)
    git(root, ['add', '-A', '--', '.', ...SNAPSHOT_EXCLUDES], env)
    const tree = git(root, ['write-tree'], env)
    const chain = parent ?? head
    const args = ['commit-tree', tree, ...(chain ? ['-p', chain] : []), '-m', 'ocr snapshot']
    return { snapshot: git(root, args, { ...env, ...SNAPSHOT_ENV }), tree, parent: chain ?? null }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export const statePath = (root) => join(root, '.scratch', 'ocr', 'state.json')

export function readState(root) {
  try {
    const state = JSON.parse(readFileSync(statePath(root), 'utf8'))
    return state && typeof state === 'object' ? state : null
  } catch {
    return null
  }
}

export function writeState(root, state) {
  mkdirSync(dirname(statePath(root)), { recursive: true })
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + NL)
}

export function chooseFrom({ root, state, branch, base, mergeBase, full }) {
  const wholeBranch = (reason) => ({ from: base, incremental: false, reason })
  if (full) return wholeBranch('full review requested')
  if (!state?.snapshot) return wholeBranch('no earlier review recorded')
  if (state.branch !== branch) return wholeBranch('branch changed since the last review')
  if (state.mergeBase !== mergeBase) return wholeBranch('merge-base with the base ref changed since the last review')
  if (!sgitOrNull(root, ['rev-parse', '--verify', '--quiet', `${state.snapshot}^{commit}`])) return wholeBranch('the previous snapshot is gone')
  return { from: state.snapshot, incremental: true, reason: 'incremental since the last review' }
}

// The npm shim is a .cmd/.ps1 pair on Windows, which Node cannot spawn safely and PowerShell may
// refuse to run, so the JS launcher inside the package is run by node directly.
export function ocrInvocation(env = process.env) {
  if (env.OCR_BIN) {
    return /\.m?js$/.test(env.OCR_BIN)
      ? { command: process.execPath, args: [env.OCR_BIN] }
      : { command: env.OCR_BIN, args: [] }
  }
  const pathDirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)
  const tail = ['node_modules', '@alibaba-group', 'open-code-review', 'bin', 'ocr.js']
  for (const dir of pathDirs) {
    for (const candidate of [join(dir, ...tail), join(dir, '..', 'lib', ...tail)]) {
      if (existsSync(candidate)) return { command: process.execPath, args: [candidate] }
    }
  }
  return { command: 'ocr', args: [] }
}

function runOcr(root, args) {
  const { command, args: prefix } = ocrInvocation()
  const result = spawnSync(command, [...prefix, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    timeout: OCR_PROCESS_TIMEOUT_MS,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...withSnapshotObjects(root) },
  })
  if (result.error?.code === 'ENOENT') throw new OcrUnavailableError('ocr was not found on PATH')
  if (result.error) throw new Error(`ocr could not run: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`ocr ${args.slice(0, 2).join(' ')} exited ${result.status}: ${String(result.stderr || result.stdout).trim().split(NL)[0]}`)
  }
  return result.stdout
}

function parseJson(text, what) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${what} did not return JSON`)
  }
}

export function previewRange(root, { from, to }) {
  const data = parseJson(runOcr(root, ['delegate', 'preview', '--format', 'json', '--from', from, '--to', to]), 'ocr delegate preview')
  if (data.schema_version !== SUPPORTED_SCHEMA) {
    throw new Error(`unsupported ocr delegate schema_version ${data.schema_version}, expected ${SUPPORTED_SCHEMA}`)
  }
  // The delegate command reports "workspace" whenever only one of --from/--to is understood, so a
  // mode other than range means the request was not the one that was made.
  if (data.mode !== 'range') throw new Error(`expected mode range from ocr delegate preview, got ${data.mode}`)
  return data
}

export function ruleGroups(root, paths) {
  const merged = new Map()
  for (let start = 0; start < paths.length; start += RULE_CHUNK) {
    const chunk = paths.slice(start, start + RULE_CHUNK)
    const data = parseJson(runOcr(root, ['delegate', 'rule', '--format', 'json', ...chunk]), 'ocr delegate rule')
    if (data.schema_version !== SUPPORTED_SCHEMA) throw new Error(`unsupported ocr delegate schema_version ${data.schema_version}`)
    for (const group of data.groups ?? []) {
      const key = [group.source, group.pattern, group.rule].join(NL)
      const known = merged.get(key)
      if (known) known.files.push(...group.files)
      else merged.set(key, { ...group, files: [...group.files] })
    }
  }
  return [...merged.values()].map((group, index) => ({ ...group, group_id: index + 1 }))
}

const sizeOf = (file) => (file.insertions ?? 0) + (file.deletions ?? 0)

export function buildBatches(files, groups, { maxFiles = BATCH_MAX_FILES, maxLines = BATCH_MAX_LINES } = {}) {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const batches = []
  const seen = new Set()
  const ordered = [...groups].sort((a, b) => b.files.length - a.files.length || a.group_id - b.group_id)
  for (const group of ordered) {
    let current = null
    for (const path of group.files) {
      const file = byPath.get(path)
      if (!file || seen.has(path)) continue
      seen.add(path)
      const size = sizeOf(file)
      if (!current || current.files.length >= maxFiles || current.lines + size > maxLines) {
        current = { id: batches.length + 1, groupId: group.group_id, source: group.source, pattern: group.pattern, files: [], lines: 0 }
        batches.push(current)
      }
      current.files.push(path)
      current.lines += size
    }
  }
  const orphans = files.filter((file) => !seen.has(file.path))
  for (let start = 0; start < orphans.length; start += maxFiles) {
    const chunk = orphans.slice(start, start + maxFiles)
    batches.push({ id: batches.length + 1, groupId: 0, source: 'none', pattern: '', files: chunk.map((f) => f.path), lines: chunk.reduce((sum, f) => sum + sizeOf(f), 0) })
  }
  return batches
}

function tryFetch(root) {
  const result = spawnSync('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: root, timeout: 10000, stdio: 'ignore', windowsHide: true })
  return result.status === 0
}

function footing(root, { base, full }) {
  const repo = describeRepo(root)
  const state = readState(root)
  const baseRef = resolveBase(root, { explicit: base, stateBase: state?.base })
  const mergeBase = mergeBaseOf(root, baseRef)
  const warnings = []
  let chosen
  if (mergeBase) {
    chosen = chooseFrom({ root, state, branch: repo.branch, base: baseRef, mergeBase, full })
  } else if (repo.head) {
    warnings.push(`no merge-base between ${baseRef} and HEAD; reviewing only work not yet committed`)
    chosen = { from: repo.head, incremental: false, reason: 'unrelated history' }
  } else {
    throw new Error('the repository has no commits to compare against')
  }
  return { repo, state, baseRef, mergeBase, chosen, warnings }
}

export function buildPlan(cwd, { base, full = false, fetch = false } = {}) {
  const root = resolveRoot(cwd)
  const warnings = []
  if (fetch && !tryFetch(root)) warnings.push('git fetch origin main failed or timed out; comparing against the last known origin/main')
  const ground = footing(root, { base, full })
  warnings.push(...ground.warnings)
  const { chosen } = ground
  const { snapshot, tree } = takeSnapshot(root, { parent: chosen.incremental ? chosen.from : ground.repo.head })
  const preview = previewRange(root, { from: chosen.from, to: snapshot })
  const reviewable = preview.reviewable_files ?? []
  const excluded = preview.excluded_files ?? []
  const groups = ruleGroups(root, reviewable.map((file) => file.path))
  const listed = new Set([...reviewable, ...excluded].map((file) => file.path))
  const mergeBase = preview.merge_base || chosen.from
  const changed = sgit(root, ['diff', '--name-only', '-z', mergeBase, snapshot]).split('\0').filter(Boolean)
  return {
    repo: ground.repo,
    base: ground.baseRef,
    mergeBase,
    from: chosen.from,
    incremental: chosen.incremental,
    reason: chosen.reason,
    snapshot,
    tree,
    warnings,
    reviewable,
    excluded,
    unlisted: changed.filter((path) => !listed.has(path)),
    groups,
    batches: buildBatches(reviewable, groups),
    totals: { reviewable: reviewable.length, excluded: excluded.length, lines: reviewable.reduce((sum, file) => sum + sizeOf(file), 0) },
  }
}

// Route groups like (tabs) and dynamic segments like [id] are real paths in this repo, and the
// printed commands are copied into a shell, so anything outside the plain set is single-quoted.
const PLAIN_PATH = /^[A-Za-z0-9_@%+=:,./-]+$/
export function quotePath(path, platform = process.platform) {
  if (PLAIN_PATH.test(path)) return path
  const escaped = platform === 'win32' ? path.split("'").join("''") : path.split("'").join("'\\''")
  return `'${escaped}'`
}

// `process.platform` alone cannot tell which shell will run the printed line: on Windows, Claude
// Code's Bash tool and Codex's `powershell.exe -Command` are both win32 Node processes, and an
// apostrophe quoted for the wrong one is not a parse error in Git Bash, it is a silently truncated
// path ('it''s.ts' -> its.ts). MSYSTEM is set by Git Bash/MSYS2 on launch and by nothing else here.
export function printingPlatform(platform = process.platform, env = process.env) {
  return platform === 'win32' && env.MSYSTEM ? 'linux' : platform
}

export function renderPlan(plan) {
  const out = []
  const kind = plan.repo.linkedWorktree ? 'linked worktree' : 'main checkout'
  out.push('# OCR review plan', '')
  out.push(`Worktree: ${plan.repo.root} (${kind})`, `Branch: ${plan.repo.branch}`)
  out.push(`Base: ${plan.base} (merge-base ${plan.mergeBase})`)
  out.push(`Review: ${plan.incremental ? 'incremental' : 'full'}, ${plan.reason}`, `From: ${plan.from}`, `Snapshot: ${plan.snapshot}`, '')
  for (const warning of plan.warnings) out.push(`Warning: ${warning}`)
  if (plan.warnings.length) out.push('')
  if (plan.reviewable.length === 0) {
    out.push('Nothing new to review since the last review.', '')
  } else {
    out.push(
      `${plan.totals.reviewable} reviewable files, ${plan.totals.lines} changed lines, ${plan.batches.length} batches.`,
      'Coverage contract: every file below ends the review as reviewed or skipped with a reason. Review each file against the rule group of its batch, and report only what the diff supports.',
      '',
    )
    for (const batch of plan.batches) {
      const rule = batch.groupId ? `rule group ${batch.groupId} (${batch.source}: ${batch.pattern})` : 'no rule group'
      out.push(`## Batch ${batch.id} of ${plan.batches.length}: ${rule}, ${batch.files.length} files, ${batch.lines} changed lines`, '')
      for (const path of batch.files) {
        const file = plan.reviewable.find((entry) => entry.path === path)
        out.push(`- ${path} (${file.status}, +${file.insertions}/-${file.deletions})`)
      }
      const shell = printingPlatform()
      out.push('', `diff: node scripts/run.mjs run-node scripts/ocr-review.mjs diff --from ${plan.mergeBase} --to ${plan.snapshot} ${batch.files.map((path) => quotePath(path, shell)).join(' ')}`, '')
    }
    for (const group of plan.groups) {
      out.push(`## Rule group ${group.group_id} (${group.source}: ${group.pattern})`, '', String(group.rule ?? '').trim(), '')
    }
  }
  const skipped = [...plan.excluded.map((file) => `${file.path} (${file.exclude_reason})`), ...plan.unlisted.map((path) => `${path} (not listed by ocr)`)]
  if (skipped.length) {
    out.push('## Not reviewed by OCR', '', 'These changed files were not selected by OCR. Review them by hand or state that they were not reviewed.', '')
    for (const line of skipped) out.push(`- ${line}`)
    out.push('')
  }
  out.push('## When the review is finished', '', `node scripts/run.mjs run-node scripts/ocr-review.mjs mark --snapshot ${plan.snapshot} --base ${plan.base}`, '')
  return out.join(NL)
}

export function markReviewed(cwd, { snapshot, base }) {
  const root = resolveRoot(cwd)
  const commit = sgitOrNull(root, ['rev-parse', '--verify', '--quiet', `${snapshot}^{commit}`])
  if (!commit) throw new Error(`unknown snapshot ${snapshot}`)
  const repo = describeRepo(root)
  const previous = readState(root)
  const baseRef = resolveBase(root, { explicit: base, stateBase: previous?.base })
  writeState(root, {
    branch: repo.branch,
    base: baseRef,
    mergeBase: mergeBaseOf(root, baseRef),
    snapshot: commit,
    tree: sgit(root, ['rev-parse', `${commit}^{tree}`]),
    nudgedTree: null,
  })
  return readState(root)
}

export function markNudged(cwd, tree) {
  const root = resolveRoot(cwd)
  writeState(root, { ...(readState(root) ?? {}), nudgedTree: tree })
}

export function checkNudge(cwd, { threshold = NUDGE_LINE_THRESHOLD } = {}) {
  try {
    const root = resolveRoot(cwd)
    const { repo, state, chosen } = footing(root, {})
    const { snapshot, tree } = takeSnapshot(root, { parent: chosen.incremental ? chosen.from : repo.head })
    if (state?.tree === tree && state.branch === repo.branch) return { nudge: false, reason: 'nothing new since the last review', tree }
    if (state?.nudgedTree === tree) return { nudge: false, reason: 'this change state was already flagged', tree }
    const reviewable = previewRange(root, { from: chosen.from, to: snapshot }).reviewable_files ?? []
    const lines = reviewable.reduce((sum, file) => sum + sizeOf(file), 0)
    return { nudge: reviewable.length > 0 && lines >= threshold, lines, files: reviewable.length, tree, snapshot }
  } catch (error) {
    return { nudge: false, skipped: error.message }
  }
}
