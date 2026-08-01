import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDesignPreflight } from './kael-design-preflight.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function main() {
  const manifestPath = resolve(root, 'docs/design-research/corpus/manifest.json')
  const runtimePath = resolve(root, 'governance/design/runtime.md')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const preflight = buildDesignPreflight({
    task: 'redesign preserve customer home intake trust',
    surface: 'customer home storytelling surface',
    workflow: 'basic intake before Kael case work',
    audience: 'HCMC apartment resident',
    designClass: 'screen',
    sourceMode: 'both',
  })

  assert(manifest.sources['ui-ux-pro-max'].commit, 'UI UX Pro Max commit is not pinned')
  assert(manifest.sources['taste-skill'].commit, 'Taste Skill commit is not pinned')
  assert(preflight.designRead.includes('Reading this as:'), 'Design Read contract is missing')
  assert(preflight.uupmEvidence?.results.length > 0, 'UUPM adapter returned no fixture evidence')
  assert(preflight.uupmEvidence.results.some((result) => result.domain === 'react-native'), 'React Native evidence is missing')
  assert(preflight.uupmEvidence.results.some((result) => result['Product Type'] === 'Home Services (Plumber/Electrician)'), 'NestScout service evidence is missing')
  assert(preflight.wheelSkills.includes('kael-frontend-test'), 'Design Wheel frontend handoff is missing')
  assert(preflight.states.includes('confirmation'), 'Workflow state contract is incomplete')

  for (const [path, expectedChecksum] of Object.entries(manifest.sources['ui-ux-pro-max'].sha256)) {
    const absolutePath = resolve(root, 'docs/design-research/corpus', path)
    assert(existsSync(absolutePath), `Missing corpus file: ${path}`)
    assert(sha256(absolutePath) === expectedChecksum, `Corpus checksum mismatch: ${path}`)
  }
  const tastePath = resolve(root, 'docs/design-research/corpus', manifest.sources['taste-skill'].upstreamExtract)
  assert(existsSync(tastePath), 'Missing Taste Skill extract')
  assert(sha256(tastePath) === manifest.sources['taste-skill'].sha256[manifest.sources['taste-skill'].upstreamExtract], 'Taste Skill checksum mismatch')

  const runtime = readFileSync(runtimePath, 'utf8')
  for (const name of ['kael-design-preflight', 'kael-design-intelligence', 'kael-design-direction']) {
    assert(runtime.includes(name), `Design router does not mention ${name}`)
  }

  console.log(`design adapters ok: ${preflight.uupmEvidence.results.length} fixture results; ${preflight.wheelSkills.length} wheel skills`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
