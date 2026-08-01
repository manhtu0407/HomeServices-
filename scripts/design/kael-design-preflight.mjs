import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { asList, parseArgs } from './csv.mjs'
import { inferDesignDirection } from './kael-design-direction.mjs'
import { searchDesignIntelligence } from './kael-design-intelligence.mjs'

const domainsByClass = Object.freeze({
  accessibility: ['react-native', 'ux'],
  'adaptive-layout': ['react-native', 'ux'],
  'design-system': ['product', 'style', 'color', 'typography', 'react-native'],
  material: ['style', 'ux', 'react-native'],
  motion: ['react-native', 'ux'],
  research: ['product', 'ux', 'ui-reasoning', 'react-native'],
  screen: ['product', 'ux', 'ui-reasoning', 'react-native'],
  component: ['ux', 'ui-reasoning', 'react-native'],
  flow: ['product', 'ux', 'react-native'],
  polish: ['style', 'ux', 'react-native'],
})

function defaultSourceMode(kind) {
  return kind === 'visual-bug' ? 'none' : 'both'
}

function buildQuery({ task, surface, workflow, query }) {
  return query || [
    task,
    surface,
    workflow,
    'NestScout HCMC apartment home services repair booking',
  ].filter(Boolean).join(' ')
}

export function buildDesignPreflight({
  task = 'UI change',
  surface = 'NestScout mobile service surface',
  workflow = 'the current product workflow',
  audience = 'HCMC apartment residents and verified workers',
  vibe = 'trustworthy, polished, friendly, and operational',
  mode,
  designClass,
  sourceMode,
  query,
  stack = 'react-native',
  domains,
} = {}) {
  const direction = inferDesignDirection({ task, surface, workflow, audience, vibe, mode, designClass })
  const resolvedSourceMode = sourceMode ?? defaultSourceMode(direction.kind)
  if (!['none', 'direction', 'intelligence', 'both'].includes(resolvedSourceMode)) {
    throw new Error(`Invalid --source-mode: ${resolvedSourceMode}`)
  }

  const needsIntelligence = resolvedSourceMode === 'intelligence' || resolvedSourceMode === 'both'
  const intelligence = needsIntelligence
    ? searchDesignIntelligence({
      query: buildQuery({ task, surface, workflow, query }),
      stack,
      domains: domains?.length ? domains : domainsByClass[direction.kind] ?? domainsByClass.screen,
      limit: 3,
    })
    : null

  const materialDecision = /material|glass|blur|surface/i.test(`${task} ${surface}`)
    ? 'Use kael-material-direction to decide role → material → variant; zero glass is valid.'
    : 'Do not add material by default; use kael-material-direction only if the surface role needs a material decision.'
  const motionDecision = /motion|animation|transition|gesture|skeleton|shimmer|polish/i.test(`${task} ${surface}`)
    ? 'Use kael-motion to decide whether motion is needed and to apply native timing and fallbacks.'
    : 'Keep the surface static unless a product moment needs feedback or state communication.'
  const tokenDecision = /token|theme|color|typography|design system/i.test(`${task} ${surface}`)
    ? 'Use kael-design-tokens and apps/mobile/design/theme.ts; upstream palette or type suggestions are candidates only.'
    : 'Reuse existing semantic tokens; do not add raw values in the surface.'

  return {
    designTask: task,
    targetSurface: surface,
    workflowStep: workflow,
    designRead: direction.designRead,
    sourceMode: resolvedSourceMode,
    uupmEvidence: intelligence,
    tasteDirectionChecks: direction.retainedPrinciples,
    nestscoutAdaptation: direction.adaptations,
    ignoredRules: direction.ignoredRules,
    designWheelClass: direction.wheelHandoff.class,
    wheelSkills: direction.wheelHandoff.skills,
    wheelProtocols: direction.wheelHandoff.protocols,
    materialMotionTokenDecision: {
      material: materialDecision,
      motion: motionDecision,
      tokens: tokenDecision,
    },
    states: direction.states,
    verificationGates: direction.verificationGates,
    acceptanceGate: direction.kind === 'research'
      ? 'Record source evidence through kael-design-evidence; do not turn an upstream heuristic into a normative rule.'
      : 'Pass the selected Design Wheel spokes, kael-design-review, and kael-frontend-test before calling the UI task done.',
    authorityFlow: [
      'NestScout hard rules and workflow contracts',
      'React Native / Expo / accessibility platform contracts',
      'Existing Design Wheel spokes and canonical design references',
      'Upstream direction and intelligence starting evidence',
      'Human taste and brand sign-off',
    ],
  }
}

function formatEvidence(report) {
  if (!report) return 'Not used for this task; source-mode is explicit.'
  if (report.results.length === 0) return `Used ${report.source.name}@${report.source.commit}, but no matching rows were found.`
  return [
    `${report.source.name}@${report.source.commit} (${report.stack})`,
    ...report.results.slice(0, 8).map((result) => {
      const label = result.Guideline || result.Issue || result.Recommended_Pattern || result['Product Type'] || result['Style Category'] || result['Pairing Name'] || result.Category || result.domain
      const detail = result.Description || result.Do || result['Key Considerations'] || result['Primary Style Recommendation'] || ''
      return `- ${result.domain}: ${label}${detail ? ` — ${detail}` : ''}`
    }),
  ].join('\n')
}

export function formatPreflightMarkdown(preflight) {
  return [
    '# Kael Design Preflight',
    '',
    `Design task: ${preflight.designTask}`,
    `Target surface: ${preflight.targetSurface}`,
    `Workflow step: ${preflight.workflowStep}`,
    `Design Read: ${preflight.designRead}`,
    `Source mode: ${preflight.sourceMode}`,
    '',
    'UUPM evidence:',
    formatEvidence(preflight.uupmEvidence),
    '',
    'Taste-derived direction checks:',
    ...preflight.tasteDirectionChecks.map((item) => `- ${item}`),
    '',
    'NestScout adaptation:',
    ...preflight.nestscoutAdaptation.map((item) => `- ${item}`),
    '',
    'Ignored rules:',
    ...preflight.ignoredRules.map((item) => `- ${item}`),
    '',
    `Design Wheel class: ${preflight.designWheelClass}`,
    `Wheel skills and protocols: ${preflight.wheelSkills.join(' + ')}${preflight.wheelProtocols.length ? `; ${preflight.wheelProtocols.join(' + ')}` : ''}`,
    '',
    'Material / motion / token decision:',
    `- Material: ${preflight.materialMotionTokenDecision.material}`,
    `- Motion: ${preflight.materialMotionTokenDecision.motion}`,
    `- Tokens: ${preflight.materialMotionTokenDecision.tokens}`,
    '',
    `States and verification gates: ${preflight.states.join(' / ')}`,
    ...preflight.verificationGates.map((item) => `- ${item}`),
    '',
    `Acceptance gate: ${preflight.acceptanceGate}`,
    '',
  ].join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  try {
    const preflight = buildDesignPreflight({
      task: args.task ?? args._[0] ?? 'UI change',
      surface: args.surface ?? 'NestScout mobile service surface',
      workflow: args.workflow ?? 'the current product workflow',
      audience: args.audience ?? 'HCMC apartment residents and verified workers',
      vibe: args.vibe ?? 'trustworthy, polished, friendly, and operational',
      mode: args.mode,
      designClass: args.class,
      sourceMode: args['source-mode'],
      query: args.query,
      stack: args.stack ?? 'react-native',
      domains: args.domains ? asList(args.domains) : undefined,
    })
    process.stdout.write(args.format === 'json' ? `${JSON.stringify(preflight, null, 2)}\n` : formatPreflightMarkdown(preflight))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
