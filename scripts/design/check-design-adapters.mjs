import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDesignPreflight } from './kael-design-preflight.mjs'
import { routeUpstreamDesignSkills } from './upstream-routing.mjs'

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

  const routes = [
    { name: 'Expo motion', input: { task: 'Add a sheet gesture animation', stack: 'expo' }, wanted: ['emil-animate-expo'], forbidden: ['emil-animate', 'emil-ask-sonner', 'emil-animation-performance'] },
    { name: 'web motion and toast', input: { task: 'Improve animation performance and Sonner toast', stack: 'web' }, wanted: ['emil-animate', 'emil-animation-performance', 'emil-ask-sonner'], forbidden: ['emil-animate-expo'] },
    { name: 'SwiftUI', input: { task: 'Write a SwiftUI transition', stack: 'swiftui' }, wanted: ['emil-write-swift'], forbidden: ['emil-animate-expo', 'emil-animate'] },
    { name: 'in-app Dynamic Notifications', input: { task: 'Add Dynamic Island notifications', stack: 'react-native' }, wanted: ['kael-dynamic-notifications'], forbidden: ['emil-animate'] },
    { name: 'system Live Activities stay outside the in-app adapter', input: { task: 'Implement iOS Live Activities', stack: 'react-native' }, wanted: [], forbidden: ['kael-dynamic-notifications'] },
    { name: 'animation audit', input: { task: 'Audit and improve motion opportunities on the UI', stack: 'react-native' }, wanted: ['emil-review-animations', 'emil-improve-animations', 'emil-find-animation-opportunities', 'emil-design-eng'], forbidden: ['emil-animate'] },
    { name: 'Apple interaction', input: { task: 'Review iOS haptic animation interaction', stack: 'react-native' }, wanted: ['emil-animate-expo', 'emil-review-animations', 'emil-apple-design'], forbidden: ['emil-animate'] },
    { name: 'animation vocabulary', input: { task: 'What do you call this spring motion?', stack: 'react-native' }, wanted: ['emil-animation-vocabulary'], forbidden: ['emil-animate'] },
    { name: 'UI stress test', input: { task: 'Stress-test UI edge cases', stack: 'react-native' }, wanted: ['emil-break-ui'], forbidden: [] },
    { name: 'explicit-only skills', input: { task: 'Prototype options and pick a UI library', stack: 'react-native' }, wanted: [], forbidden: ['emil-prototype', 'emil-pick-ui-library'] },
  ]
  for (const route of routes) {
    const result = routeUpstreamDesignSkills(route.input)
    for (const id of route.wanted) assert(result.selected.includes(id), `${route.name} did not select ${id}`)
    for (const id of route.forbidden) assert(!result.selected.includes(id), `${route.name} incorrectly selected ${id}`)
    assert(!result.selected.some((id) => result.explicitOnly.includes(id)), `${route.name} auto-selected an explicit-only skill`)
  }
  assert(preflight.explicitOnlySkills.includes('emil-pick-ui-library') && preflight.explicitOnlySkills.includes('emil-prototype'), 'Preflight does not disclose explicit-only upstream skills')
  const motionPreflight = buildDesignPreflight({ task: 'add gesture animation to a sheet', stack: 'react-native', sourceMode: 'none' })
  assert(motionPreflight.upstreamSkills.includes('emil-animate-expo'), 'Preflight does not route RN motion to Emil Expo')

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

  console.log(`design adapters ok: ${preflight.uupmEvidence.results.length} fixture results; ${preflight.wheelSkills.length} wheel skills; ${routes.length} upstream routing cases`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
