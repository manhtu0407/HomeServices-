import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CORPUS = 'docs/design-research/corpus'
const MANIFEST_PATH = resolve(ROOT, CORPUS, 'upstream-manifest.json')
const EMIL_IDS = [
  'emil-animate', 'emil-animate-expo', 'emil-review-animations', 'emil-improve-animations',
  'emil-find-animation-opportunities', 'emil-animation-performance', 'emil-animation-vocabulary',
  'emil-apple-design', 'emil-write-swift', 'emil-pick-ui-library', 'emil-prototype',
  'emil-mobile-native', 'emil-break-ui', 'emil-ask-sonner', 'emil-design-eng',
]
const EXPECTED = new Map([
  ['emilkowalski-skills', { commit: '2d228630ba1446365f614a108cb8252f1feda202', files: 29, archiveSha256: 'e73ca0e374a08dc7e2c3d58984bfb9ec57325a35c6a4addf076c636b7e27225f' }],
  ['expo-dynamic-notifications', { commit: '5de059a5cbefbe28c14efbe785166665a7c70bc5', files: 103, archiveSha256: '20d866ab4320e648900eb87a0da45f2a1be6b5d155a27944d31e9a5490d7de06' }],
])
const COVERAGE = new Set(['adapt-rn', 'direct-reference', 'explicit-only', 'reference-only', 'runtime-neutral', 'sandbox-only', 'swift-only', 'web-only'])
const problems = []

function assert(condition, message) {
  if (!condition) problems.push(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function checkSources(manifest) {
  assert(manifest.readmeMapping?.includes('UPSTREAM-README.md'), 'README remapping is undocumented')
  assert(manifest.sources.length === EXPECTED.size, `expected ${EXPECTED.size} pinned sources`)
  for (const [id, expected] of EXPECTED) {
    const source = manifest.sources.find((item) => item.id === id)
    assert(source, `missing source record ${id}`)
    if (!source) continue
    assert(source.commit === expected.commit, `${id} commit drift`)
    assert(source.fileCount === expected.files, `${id} source file count drift`)
    assert(source.files.length === expected.files, `${id} inventory entry count drift`)
    assert(source.license === 'MIT', `${id} license record drift`)
    const archive = resolve(ROOT, source.archivePath)
    assert(existsSync(archive), `${id} source archive is missing`)
    if (existsSync(archive)) assert(sha256(archive) === expected.archiveSha256 && sha256(archive) === source.archiveSha256, `${id} archive checksum mismatch`)

    const directory = resolve(ROOT, CORPUS, 'upstream', id)
    assert(existsSync(directory), `${id} extracted source directory is missing`)
    if (!existsSync(directory)) continue
    const expectedByPath = new Map()
    for (const entry of source.files) {
      assert(!expectedByPath.has(entry.vendoredPath), `${id} duplicate vendored path ${entry.vendoredPath}`)
      expectedByPath.set(entry.vendoredPath, entry)
      const path = resolve(directory, entry.vendoredPath)
      assert(path.startsWith(`${directory}${sep}`), `${id} path escapes source directory: ${entry.vendoredPath}`)
      assert(existsSync(path) && statSync(path).isFile(), `${id} missing source file ${entry.vendoredPath}`)
      if (existsSync(path)) {
        assert(statSync(path).size === entry.bytes, `${id} byte count mismatch: ${entry.sourcePath}`)
        assert(sha256(path) === entry.sha256, `${id} checksum mismatch: ${entry.sourcePath}`)
      }
      assert(COVERAGE.has(entry.coverage?.status), `${id} invalid/missing disposition: ${entry.sourcePath}`)
      assert(Array.isArray(entry.coverage?.notes), `${id} missing disposition notes: ${entry.sourcePath}`)
    }
    const archiveName = basename(source.archivePath)
    const actual = walk(directory).filter((path) => relative(directory, path).split(sep).join('/') !== archiveName)
      .map((path) => path.slice(directory.length + 1).split(sep).join('/')).sort()
    const expectedPaths = [...expectedByPath.keys()].sort()
    assert(actual.length === expectedPaths.length && actual.every((path, index) => path === expectedPaths[index]), `${id} extracted tree and declared inventory differ`)
  }
}

function checkSkills() {
  const descriptors = new Map()
  for (const id of EMIL_IDS) {
    const skill = resolve(ROOT, '.claude/skills', id)
    const upstreamName = id === 'emil-design-eng' ? 'emil-design-eng' : id.slice('emil-'.length)
    const source = resolve(ROOT, CORPUS, 'upstream/emilkowalski-skills/skills', upstreamName, 'SKILL.md')
    const skillFile = resolve(skill, 'SKILL.md')
    const descriptor = resolve(skill, 'agents/openai.yaml')
    assert(existsSync(skillFile), `${id} canonical wrapper is missing`)
    assert(existsSync(descriptor), `${id} Codex descriptor is missing`)
    assert(existsSync(source), `${id} upstream skill source is missing`)
    if (existsSync(skillFile)) {
      const text = readFileSync(skillFile, 'utf8')
      assert(text.includes(`name: ${id}`), `${id} frontmatter name mismatch`)
      assert(text.includes('commit 2d228630ba1446365f614a108cb8252f1feda202'), `${id} source pin is missing`)
      assert(text.toLowerCase().includes('read its full source'), `${id} does not direct users to complete source`)
    }
    if (existsSync(descriptor)) descriptors.set(id, readFileSync(descriptor, 'utf8'))
  }
  for (const id of ['emil-pick-ui-library', 'emil-prototype']) assert(descriptors.get(id)?.includes('allow_implicit_invocation: false'), `${id} must remain explicit-only`)
  const dynamicSkill = resolve(ROOT, '.claude/skills/kael-dynamic-notifications/SKILL.md')
  const dynamicDescriptor = resolve(ROOT, '.claude/skills/kael-dynamic-notifications/agents/openai.yaml')
  assert(existsSync(dynamicSkill) && existsSync(dynamicDescriptor), 'Dynamic Notifications skill or descriptor is missing')
  if (existsSync(dynamicSkill)) {
    const text = readFileSync(dynamicSkill, 'utf8')
    for (const required of ['duration', 'callbacks', 'custom content', 'geometry', 'animation drivers', 'Reduce Motion', 'Reduce Transparency', 'one-active/one-pending']) {
      assert(text.toLowerCase().includes(required.toLowerCase()), `Dynamic Notifications skill is missing API/adaptation coverage: ${required}`)
    }
  }
  for (const path of ['CLAUDE.md', 'AGENTS.md']) assert(readFileSync(resolve(ROOT, path), 'utf8').includes('51 total'), `${path} does not declare the 51-skill total`)
}

function main() {
  if (!existsSync(MANIFEST_PATH)) throw new Error('missing upstream manifest')
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  checkSources(manifest)
  checkSkills()
  if (problems.length) {
    for (const problem of problems) console.error(`- ${problem}`)
    process.exitCode = 1
    return
  }
  const total = manifest.sources.reduce((sum, source) => sum + source.files.length, 0)
  console.log(`upstream design assets ok: ${manifest.sources.length} pinned repositories, ${total} files, ${EMIL_IDS.length} Emil skills, 1 notification skill`)
}

main()
