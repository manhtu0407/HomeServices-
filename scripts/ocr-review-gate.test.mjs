import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  NUDGE_LINE_THRESHOLD,
  OCR_PROCESS_TIMEOUT_MS,
  buildBatches,
  buildPlan,
  checkNudge,
  describeRepo,
  diffFiles,
  gitErrorDetail,
  markNudged,
  markReviewed,
  objectsDir,
  ocrInvocation,
  quotePath,
  readState,
  renderPlan,
  resolveBase,
  resolveRoot,
  sgit,
  takeSnapshot,
  writeState,
} from './lib/ocr-review-gate.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = join(ROOT, '.claude', 'hooks', 'verify-ocr-review.mjs')
const CLI = join(ROOT, 'scripts', 'ocr-review.mjs')
const NL = String.fromCharCode(10)

// A stand-in for `ocr` that derives its answers from real git, so range semantics are the same
// ones the real CLI relies on while the tests stay offline.
const FAKE_OCR_SOURCE = [
  "import { execFileSync } from 'node:child_process'",
  'const NL = String.fromCharCode(10)',
  'const TAB = String.fromCharCode(9)',
  'const args = process.argv.slice(2)',
  "const git = (a) => execFileSync('git', a, { encoding: 'utf8' }).trim()",
  'const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }',
  "const REVIEWABLE = ['.ts', '.mjs', '.sql', '.json']",
  "if (args[0] !== 'delegate') { console.error('unsupported'); process.exit(2) }",
  "if (args[1] === 'preview') {",
  "  const from = flag('--from'); const to = flag('--to')",
  "  const mb = git(['merge-base', from, to])",
  "  const rows = git(['diff', '--numstat', mb, to]).split(NL).filter(Boolean).map((l) => l.split(TAB))",
  '  const status = {}',
  "  for (const l of git(['diff', '--name-status', mb, to]).split(NL).filter(Boolean)) { const [s, p] = l.split(TAB); status[p] = s === 'A' ? 'added' : s === 'D' ? 'deleted' : 'modified' }",
  '  const reviewable = []; const excluded = []',
  '  for (const [ins, del, path] of rows) {',
  '    const entry = { path, status: status[path], insertions: Number(ins), deletions: Number(del) }',
  "    if (REVIEWABLE.some((e) => path.endsWith(e))) reviewable.push(entry); else excluded.push({ ...entry, exclude_reason: 'unsupported_ext' })",
  '  }',
  "  const mode = process.env.FAKE_OCR_MODE || 'range'",
  "  console.log(JSON.stringify({ schema_version: process.env.FAKE_OCR_SCHEMA || '1', mode, repository: '', from, to, merge_base: mb, total_files: rows.length, reviewable_count: reviewable.length, excluded_count: excluded.length, reviewable_files: reviewable, excluded_files: excluded }))",
  "} else if (args[1] === 'rule') {",
  '  const paths = args.slice(4)',
  "  const sql = paths.filter((p) => p.endsWith('.sql')); const rest = paths.filter((p) => !p.endsWith('.sql'))",
  '  const groups = []',
  "  if (rest.length) groups.push({ group_id: 1, source: 'system', pattern: '**/*.ts', files: rest, rule: 'RULE-TS' })",
  "  if (sql.length) groups.push({ group_id: 2, source: 'project', pattern: '**/*.sql', files: sql, rule: 'RULE-SQL' })",
  "  console.log(JSON.stringify({ schema_version: '1', groups }))",
  '}',
].join(NL)

let sandbox
let fakeOcr
const previousOcrBin = process.env.OCR_BIN

before(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'ocr-gate-'))
  fakeOcr = join(sandbox, 'fake-ocr.mjs')
  writeFileSync(fakeOcr, FAKE_OCR_SOURCE)
  process.env.OCR_BIN = fakeOcr
})

after(() => {
  if (previousOcrBin === undefined) delete process.env.OCR_BIN
  else process.env.OCR_BIN = previousOcrBin
  rmSync(sandbox, { recursive: true, force: true })
})

let counter = 0
const fresh = (name) => join(sandbox, `${name}-${counter++}`)

function run(cwd, args, env) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function configure(dir) {
  for (const [key, value] of [['user.name', 'test'], ['user.email', 'test@example.invalid'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) {
    run(dir, ['config', key, value])
  }
}

function write(dir, rel, text) {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function commitAll(dir, message) {
  run(dir, ['add', '-A'])
  run(dir, ['commit', '-q', '-m', message])
  return run(dir, ['rev-parse', 'HEAD'])
}

const lines = (count, tag = 'line') => Array.from({ length: count }, (_, i) => `export const ${tag}${i} = ${i}`).join(NL) + NL

// origin (with one commit) cloned into `work`, which then branches from origin/main.
function project({ upstreamAhead = false } = {}) {
  const base = fresh('project')
  const origin = join(base, 'origin')
  mkdirSync(origin, { recursive: true })
  run(origin, ['init', '-q', '-b', 'main'])
  configure(origin)
  write(origin, '.gitignore', '.scratch/' + NL)
  write(origin, 'src/a.ts', 'export const a = 1' + NL)
  write(origin, 'src/b.ts', 'export const b = 1' + NL)
  write(origin, 'README.md', '# readme' + NL)
  commitAll(origin, 'initial')
  const work = join(base, 'work')
  run(base, ['clone', '-q', '-c', 'core.autocrlf=false', origin, work])
  configure(work)
  if (upstreamAhead) {
    write(origin, 'src/upstream.ts', 'export const upstream = 1' + NL)
    commitAll(origin, 'upstream change')
    run(work, ['fetch', '-q', 'origin'])
  }
  run(work, ['checkout', '-q', '-b', 'feature', 'origin/main'])
  return { base, origin, work }
}

function fingerprint(dir) {
  const files = run(dir, ['ls-files', '-co', '--exclude-standard']).split(NL).filter(Boolean)
  const content = createHash('sha256')
  for (const file of files) content.update(file).update(readFileSync(join(dir, file)))
  return {
    head: run(dir, ['rev-parse', 'HEAD']),
    refs: run(dir, ['for-each-ref']),
    status: run(dir, ['status', '--porcelain=v1', '-uall']),
    index: run(dir, ['ls-files', '-s']),
    stash: run(dir, ['stash', 'list']),
    objects: run(dir, ['count-objects', '-v']),
    content: content.digest('hex'),
  }
}

const treeFiles = (dir, commit) => sgit(dir, ['ls-tree', '-r', '--name-only', commit]).split(NL).filter(Boolean)
const same = (a, b) => realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase()

test('a snapshot captures modified, staged and untracked files and writes nothing to the repository', () => {
  const { work } = project()
  write(work, 'src/a.ts', 'export const a = 2' + NL)
  write(work, 'src/staged.ts', 'export const s = 1' + NL)
  run(work, ['add', 'src/staged.ts'])
  write(work, 'src/new.ts', 'export const n = 1' + NL)
  const before = fingerprint(work)

  const { snapshot, tree } = takeSnapshot(work)

  assert.deepEqual(fingerprint(work), before)
  const files = treeFiles(work, snapshot)
  for (const expected of ['src/a.ts', 'src/staged.ts', 'src/new.ts']) assert.ok(files.includes(expected), expected)
  assert.equal(sgit(work, ['show', `${snapshot}:src/a.ts`]), 'export const a = 2')
  assert.equal(sgit(work, ['rev-parse', `${snapshot}^{tree}`]), tree)
  assert.equal(sgit(work, ['rev-parse', `${snapshot}^`]), run(work, ['rev-parse', 'HEAD']))
  assert.deepEqual(readdirSync(dirname(objectsDir(work))).filter((name) => name.startsWith('snap-')), [], 'the temporary index is removed')
})

test('snapshot objects live in a private store, invisible to the repository object database', () => {
  const { work } = project()
  write(work, 'src/new.ts', 'export const n = 1' + NL)

  const { snapshot } = takeSnapshot(work)

  assert.throws(() => run(work, ['cat-file', '-e', snapshot]), /failed|Not a valid|exit/i)
  assert.equal(sgit(work, ['cat-file', '-t', snapshot]), 'commit')
  assert.ok(existsSync(objectsDir(work)))
})

test('a snapshot never captures secret-shaped files or the review state directory', () => {
  const { work } = project()
  const secrets = ['.env', '.env.local', 'keys/server.pem', 'id_rsa', '.npmrc', '.ssh/id_ed25519', 'nested/.ssh/id_ed25519', '.scratch/ocr/state.json']
  for (const secret of secrets) write(work, secret, 'x' + NL)
  write(work, 'src/ok.ts', 'export const ok = 1' + NL)

  const files = treeFiles(work, takeSnapshot(work).snapshot)

  assert.ok(files.includes('src/ok.ts'))
  for (const secret of secrets) {
    assert.ok(!files.includes(secret), `${secret} must not be in the snapshot`)
  }
})

test('a snapshot removes tracked secret-shaped files from its private index without changing the worktree', () => {
  const { work } = project()
  const secrets = ['.env', '.env.local', 'keys/server.pem', 'id_rsa', 'nested/id_rsa.pub', '.npmrc', '.ssh/id_ed25519', 'nested/.ssh/id_ed25519', '.scratch/ocr/state.json']
  for (const secret of secrets) write(work, secret, `committed ${secret}` + NL)
  run(work, ['add', '-f', '.scratch/ocr/state.json'])
  commitAll(work, 'tracked secret-shaped files')
  for (const secret of secrets) write(work, secret, `working ${secret}` + NL)
  write(work, 'src/ok.ts', 'export const ok = 1' + NL)
  const before = fingerprint(work)

  const snapshot = takeSnapshot(work).snapshot
  const files = treeFiles(work, snapshot)

  assert.deepEqual(fingerprint(work), before)
  assert.ok(files.includes('src/ok.ts'))
  for (const secret of secrets) {
    assert.ok(!files.includes(secret), `${secret} must not be in the snapshot`)
    assert.equal(readFileSync(join(work, secret), 'utf8'), `working ${secret}` + NL)
  }
})

test('the same tree and parent give the same snapshot and no ref is created', () => {
  const { work } = project()
  write(work, 'src/a.ts', 'export const a = 3' + NL)
  const refsBefore = run(work, ['for-each-ref'])

  const first = takeSnapshot(work)
  const second = takeSnapshot(work)

  assert.equal(first.snapshot, second.snapshot)
  assert.equal(run(work, ['for-each-ref']), refsBefore)
})

test('a linked worktree resolves from a subdirectory and only its own changes are captured', () => {
  const { base, work } = project()
  const wt = join(base, 'wt')
  run(work, ['worktree', 'add', '-q', '-b', 'wtbranch', wt, 'origin/main'])
  write(wt, 'src/wt-only.ts', 'export const w = 1' + NL)
  write(work, 'src/main-only.ts', 'export const m = 1' + NL)

  const top = resolveRoot(join(wt, 'src'))

  assert.ok(same(top, wt))
  assert.equal(describeRepo(top).linkedWorktree, true)
  assert.equal(describeRepo(work).linkedWorktree, false)
  const files = treeFiles(top, takeSnapshot(top).snapshot)
  assert.ok(files.includes('src/wt-only.ts'))
  assert.ok(!files.includes('src/main-only.ts'))
})

test('the base is the explicit ref, then the recorded one, then origin/main, then main', () => {
  const { work } = project()
  assert.equal(resolveBase(work, {}), 'origin/main')
  assert.equal(resolveBase(work, { stateBase: 'main' }), 'main')
  assert.equal(resolveBase(work, { explicit: 'feature', stateBase: 'main' }), 'feature')
  assert.throws(() => resolveBase(work, { explicit: 'no-such-ref' }), /not found/)

  const lone = fresh('lone')
  mkdirSync(lone, { recursive: true })
  run(lone, ['init', '-q', '-b', 'main'])
  configure(lone)
  write(lone, 'a.ts', 'x' + NL)
  commitAll(lone, 'first')
  assert.equal(resolveBase(lone, {}), 'main')

  const noBase = fresh('nobase')
  mkdirSync(noBase, { recursive: true })
  run(noBase, ['init', '-q', '-b', 'trunk'])
  configure(noBase)
  write(noBase, 'a.ts', 'x' + NL)
  commitAll(noBase, 'first')
  assert.throws(() => resolveBase(noBase, {}), /no base ref/)
})

test('one plan covers committed, uncommitted and untracked work in a combined diff against origin/main', () => {
  const { work } = project({ upstreamAhead: true })
  write(work, 'src/a.ts', 'export const a = 1' + NL + 'export const committed = 1' + NL)
  const forkPoint = run(work, ['rev-parse', 'origin/main'])
  commitAll(work, 'committed change')
  write(work, 'src/a.ts', 'export const a = 1' + NL + 'export const committed = 1' + NL + 'export const uncommitted = 1' + NL)
  write(work, 'src/new.ts', 'export const n = 1' + NL)
  write(work, 'notes.md', '# notes' + NL)

  const plan = buildPlan(work, {})

  assert.equal(plan.base, 'origin/main')
  assert.equal(plan.mergeBase, forkPoint)
  assert.deepEqual(plan.reviewable.map((f) => f.path).sort(), ['src/a.ts', 'src/new.ts'])
  assert.deepEqual(plan.excluded.map((f) => f.path), ['notes.md'])
  assert.equal(plan.excluded[0].exclude_reason, 'unsupported_ext')
  const combined = diffFiles(work, { from: plan.mergeBase, to: plan.snapshot, paths: ['src/a.ts'] })
  assert.match(combined, /\+export const committed = 1/)
  assert.match(combined, /\+export const uncommitted = 1/)
  assert.ok(!plan.reviewable.some((f) => f.path === 'src/upstream.ts'), 'commits already on origin/main are not reviewed')
  assert.ok(run(work, ['diff', '--name-only', 'main', 'HEAD']).includes('src/upstream.ts'), 'a stale local main would have pulled them in')
})

test('an ocr answer whose mode is not range is refused', () => {
  const { work } = project()
  write(work, 'src/new.ts', 'export const n = 1' + NL)
  process.env.FAKE_OCR_MODE = 'workspace'
  try {
    assert.throws(() => buildPlan(work, {}), /mode/)
  } finally {
    delete process.env.FAKE_OCR_MODE
  }
})

test('an unknown schema_version is refused instead of guessed', () => {
  const { work } = project()
  write(work, 'src/new.ts', 'export const n = 1' + NL)
  process.env.FAKE_OCR_SCHEMA = '99'
  try {
    assert.throws(() => buildPlan(work, {}), /schema_version/)
  } finally {
    delete process.env.FAKE_OCR_SCHEMA
  }
})

test('review is incremental, survives a commit, and falls back to a full review when its footing changes', () => {
  const { origin, work } = project()
  write(work, 'src/a.ts', 'export const a = 2' + NL)
  write(work, 'src/b.ts', 'export const b = 2' + NL)

  const first = buildPlan(work, {})
  assert.equal(first.incremental, false)
  assert.deepEqual(first.reviewable.map((f) => f.path).sort(), ['src/a.ts', 'src/b.ts'])
  markReviewed(work, { snapshot: first.snapshot })

  const second = buildPlan(work, {})
  assert.equal(second.incremental, true)
  assert.equal(second.reviewable.length, 0)

  write(work, 'src/a.ts', 'export const a = 3' + NL)
  const third = buildPlan(work, {})
  assert.equal(third.incremental, true)
  assert.deepEqual(third.reviewable.map((f) => f.path), ['src/a.ts'])
  markReviewed(work, { snapshot: third.snapshot })

  commitAll(work, 'commit everything')
  const fourth = buildPlan(work, {})
  assert.equal(fourth.incremental, true)
  assert.equal(fourth.reviewable.length, 0, 'committing does not change the tree, so nothing is re-reviewed')
  markReviewed(work, { snapshot: fourth.snapshot })

  write(origin, 'src/upstream.ts', 'export const u = 1' + NL)
  commitAll(origin, 'new upstream commit')
  run(work, ['fetch', '-q', 'origin'])
  run(work, ['rebase', '-q', 'origin/main'])
  const rebased = buildPlan(work, {})
  assert.equal(rebased.incremental, false)
  assert.match(rebased.reason, /merge-base/)
  assert.deepEqual(rebased.reviewable.map((f) => f.path).sort(), ['src/a.ts', 'src/b.ts'])
  markReviewed(work, { snapshot: rebased.snapshot })

  run(work, ['checkout', '-q', '-b', 'other'])
  assert.match(buildPlan(work, {}).reason, /branch/)
})

test('a recorded snapshot that no longer exists falls back to a full review', () => {
  const { work } = project()
  write(work, 'src/a.ts', 'export const a = 2' + NL)
  const first = buildPlan(work, {})
  markReviewed(work, { snapshot: first.snapshot })
  writeState(work, { ...readState(work), snapshot: '0'.repeat(40) })

  const plan = buildPlan(work, {})

  assert.equal(plan.incremental, false)
  assert.match(plan.reason, /gone/)
  assert.equal(plan.reviewable.length, 1)
})

test('git errors drop warnings so the real failure is reported', () => {
  const stderr = "warning: unable to access '/home/x/.config/git/ignore': Permission denied" + NL + 'error: insufficient permission for adding an object to repository database .git/objects' + NL + 'fatal: failed to write object' + NL
  assert.equal(gitErrorDetail(stderr), 'error: insufficient permission for adding an object to repository database .git/objects | fatal: failed to write object')
  assert.equal(gitErrorDetail(''), 'no error output')
  assert.equal(gitErrorDetail('warning: only a warning'), 'no error output')
})

test('files are batched by rule group and bounded by file count and changed lines', () => {
  const file = (path, n) => ({ path, status: 'modified', insertions: n, deletions: 0 })
  const groups = [
    { group_id: 1, source: 'system', pattern: '**/*.ts', rule: 'TS', files: Array.from({ length: 10 }, (_, i) => `a${i}.ts`) },
    { group_id: 2, source: 'project', pattern: '**/*.sql', rule: 'SQL', files: ['big.sql', 'small.sql'] },
  ]
  const files = [...groups[0].files.map((p) => file(p, 5)), file('big.sql', 2000), file('small.sql', 3)]

  const batches = buildBatches(files, groups)

  const ts = batches.filter((b) => b.groupId === 1)
  assert.deepEqual(ts.map((b) => b.files.length), [8, 2])
  const sql = batches.filter((b) => b.groupId === 2)
  assert.equal(sql.length, 2, 'an oversized file gets a batch of its own')
  assert.ok(sql.some((b) => b.files.length === 1 && b.files[0] === 'big.sql'))
  assert.equal(batches.flatMap((b) => b.files).length, 12, 'every file lands in exactly one batch')
})

test('diff commands quote paths that a shell would otherwise split, expand or reject', () => {
  const awkward = ['apps/mobile/app/(tabs)/index.tsx', 'apps/api/src/app/api/jobs/[id]/accept/route.ts', 'notes with space.ts', "it's.ts"]
  const plan = {
    repo: { root: '/repo', branch: 'feature', linkedWorktree: false },
    base: 'origin/main',
    mergeBase: 'a'.repeat(40),
    from: 'origin/main',
    incremental: false,
    reason: 'full review requested',
    snapshot: 'b'.repeat(40),
    warnings: [],
    reviewable: [...awkward, 'src/plain.ts'].map((path) => ({ path, status: 'modified', insertions: 1, deletions: 0 })),
    excluded: [],
    unlisted: [],
    groups: [{ group_id: 1, source: 'project', pattern: '**', rule: 'R', files: [...awkward, 'src/plain.ts'] }],
    batches: [{ id: 1, groupId: 1, source: 'project', pattern: '**', files: [...awkward, 'src/plain.ts'], lines: 5 }],
    totals: { reviewable: 5, excluded: 0, lines: 5 },
  }

  const out = renderPlan(plan)

  const diffLine = out.split(NL).find((line) => line.startsWith('diff: '))
  assert.match(diffLine, /^diff: node scripts\/run\.mjs run-node scripts\/ocr-review\.mjs diff --from a{40} --to b{40} /)
  assert.ok(diffLine.includes("'apps/mobile/app/(tabs)/index.tsx'"))
  assert.ok(diffLine.includes("'apps/api/src/app/api/jobs/[id]/accept/route.ts'"))
  assert.ok(diffLine.includes("'notes with space.ts'"))
  assert.ok(diffLine.includes(quotePath("it's.ts")))
  assert.ok(diffLine.endsWith(' src/plain.ts'), 'a plain path stays unquoted')
})

test('diff paths escape apostrophes for PowerShell and POSIX shells', () => {
  assert.equal(quotePath("it's.ts", 'win32'), "'it''s.ts'")
  assert.equal(quotePath("it's.ts", 'linux'), "'it'\\''s.ts'")
})

test('the Stop hook timeout exceeds the OCR subprocess timeout', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'))
  const hook = settings.hooks.Stop.flatMap((group) => group.hooks).find((entry) => entry.command.includes('verify-ocr-review.mjs'))

  assert.ok(hook, 'the OCR Stop hook must remain configured')
  assert.ok(hook.timeout * 1000 > OCR_PROCESS_TIMEOUT_MS, 'the host timeout must leave room for the OCR subprocess')
})

test('ocr is launched through node when the npm layout or an override is found, never through a shell shim', () => {
  assert.deepEqual(ocrInvocation({ OCR_BIN: '/x/ocr.js', PATH: '' }), { command: process.execPath, args: ['/x/ocr.js'] })
  assert.deepEqual(ocrInvocation({ OCR_BIN: '/x/ocr', PATH: '' }), { command: '/x/ocr', args: [] })

  const prefix = fresh('npm-prefix')
  const launcher = join(prefix, 'node_modules', '@alibaba-group', 'open-code-review', 'bin', 'ocr.js')
  write(prefix, join('node_modules', '@alibaba-group', 'open-code-review', 'bin', 'ocr.js'), '// launcher' + NL)
  assert.deepEqual(ocrInvocation({ PATH: [join(sandbox, 'elsewhere'), prefix].join(process.platform === 'win32' ? ';' : ':') }), {
    command: process.execPath,
    args: [launcher],
  })
})

test('the nudge fires once per change state and only above the threshold', () => {
  const { work } = project()
  write(work, 'src/small.ts', lines(3))
  assert.equal(checkNudge(work).nudge, false)

  write(work, 'src/big.ts', lines(NUDGE_LINE_THRESHOLD + 5))
  const over = checkNudge(work)
  assert.equal(over.nudge, true)
  assert.ok(over.lines >= NUDGE_LINE_THRESHOLD)

  markNudged(work, over.tree)
  assert.equal(checkNudge(work).nudge, false, 'the same state is not nudged twice')

  const plan = buildPlan(work, {})
  markReviewed(work, { snapshot: plan.snapshot })
  assert.equal(checkNudge(work).nudge, false)

  write(work, 'src/big.ts', lines(NUDGE_LINE_THRESHOLD + 40, 'other'))
  assert.equal(checkNudge(work).nudge, true, 'new work after a review is nudged again')
})

test('the nudge stays silent and reports why when ocr or git cannot answer', () => {
  const { work } = project()
  write(work, 'src/big.ts', lines(NUDGE_LINE_THRESHOLD + 5))
  const saved = process.env.OCR_BIN
  process.env.OCR_BIN = join(sandbox, 'does-not-exist.js')
  try {
    const result = checkNudge(work)
    assert.equal(result.nudge, false)
    assert.ok(result.skipped)
  } finally {
    process.env.OCR_BIN = saved
  }
  const outside = fresh('not-a-repo')
  mkdirSync(outside, { recursive: true })
  const result = checkNudge(outside)
  assert.equal(result.nudge, false)
  assert.ok(result.skipped)
})

function runHook(projectDir, stdin) {
  return spawnSync(process.execPath, [HOOK], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  })
}

test('the Stop hook blocks once with the command to run, then lets the turn end', () => {
  const { work } = project()
  const payload = JSON.stringify({ cwd: work })

  write(work, 'src/small.ts', lines(3))
  assert.equal(runHook(work, payload).status, 0)

  write(work, 'src/big.ts', lines(NUDGE_LINE_THRESHOLD + 5))
  const blocked = runHook(work, payload)
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /\/ocr-review/)

  assert.equal(runHook(work, payload).status, 0, 'the second stop for the same state passes')
})

test('the Stop hook fails open on unreadable input, missing repo or missing ocr', () => {
  const { work } = project()
  write(work, 'src/big.ts', lines(NUDGE_LINE_THRESHOLD + 5))
  assert.equal(runHook(work, 'not json').status, 0)

  const outside = fresh('outside')
  mkdirSync(outside, { recursive: true })
  assert.equal(runHook(outside, JSON.stringify({ cwd: outside })).status, 0)

  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: work }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: work, OCR_BIN: join(sandbox, 'missing.js') },
  })
  assert.equal(result.status, 0)
})

test('the Stop hook fails open on empty input even when the project would trigger a nudge', () => {
  const { work } = project()
  write(work, 'src/big.ts', lines(NUDGE_LINE_THRESHOLD + 5))

  assert.equal(runHook(work, '').status, 0)
  assert.equal(runHook(work, ' \r\n ').status, 0)
})

test('the command line plans, records a review, and then reports nothing new', () => {
  const { work } = project()
  write(work, 'src/new.ts', 'export const n = 1' + NL)
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: work, encoding: 'utf8', env: process.env })

  const planned = cli('plan')
  assert.equal(planned.status, 0, planned.stderr)
  assert.match(planned.stdout, /src\/new\.ts/)
  const snapshot = /Snapshot: ([0-9a-f]{40})/.exec(planned.stdout)?.[1]
  assert.ok(snapshot, planned.stdout)
  const mergeBase = /merge-base ([0-9a-f]{40})/.exec(planned.stdout)?.[1]
  const diff = cli('diff', '--from', mergeBase, '--to', snapshot, 'src/new.ts')
  assert.equal(diff.status, 0, diff.stderr)
  assert.match(diff.stdout, /\+export const n = 1/)
  assert.notEqual(cli('diff', '--from', mergeBase).status, 0)

  const marked = cli('mark', '--snapshot', snapshot)
  assert.equal(marked.status, 0, marked.stderr)

  const again = cli('plan')
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /Nothing new to review/)

  assert.notEqual(cli('mark').status, 0)
  assert.notEqual(cli('bogus').status, 0)
})
