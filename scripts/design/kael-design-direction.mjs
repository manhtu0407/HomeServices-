import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from './csv.mjs'

const wheelHandoffs = Object.freeze({
  flow: {
    skills: ['kael-prototype', 'kael-frontend-test'],
    protocols: ['kael-ui-rn-execution'],
  },
  screen: {
    skills: ['kael-material-direction', 'kael-motion', 'kael-frontend-test'],
    protocols: ['kael-ui-rn-execution'],
  },
  component: {
    skills: ['kael-material-direction', 'kael-motion', 'kael-frontend-test'],
    protocols: ['kael-ui-rn-execution'],
  },
  'design-system': {
    skills: ['kael-design-tokens', 'kael-design-review', 'kael-frontend-test'],
    protocols: [],
  },
  material: {
    skills: ['kael-material-direction', 'kael-motion'],
    protocols: [],
  },
  motion: {
    skills: ['kael-motion', 'kael-frontend-test'],
    protocols: [],
  },
  accessibility: {
    skills: ['kael-accessible-content', 'kael-frontend-test'],
    protocols: [],
  },
  'adaptive-layout': {
    skills: ['kael-adaptive-layout', 'kael-frontend-test'],
    protocols: [],
  },
  'visual-bug': {
    skills: ['kael-visual-qa', 'kael-diagnose', 'kael-frontend-test'],
    protocols: [],
  },
  polish: {
    skills: ['kael-design-review', 'kael-motion', 'kael-material-direction', 'kael-frontend-test'],
    protocols: [],
  },
  research: {
    skills: ['kael-research', 'kael-design-evidence'],
    protocols: [],
  },
})

const retainedPrinciples = Object.freeze([
  'Infer the surface, audience, workflow, existing brand, and quiet constraints before choosing an aesthetic.',
  'Emit one concise Design Read before implementation.',
  'Audit an existing surface before redesigning it.',
  'Reject generic AI defaults and decoration without a product reason.',
  'Design loading, empty, error, success, retry, and confirmation states together.',
])

const ignoredRules = Object.freeze([
  'Variance, novelty, or cinematic intensity dials as independent product goals.',
  'Landing-page, portfolio, dashboard, and marketing conversion patterns for the mobile service app.',
  'DOM, CSS, hover, GSAP, scroll-hijack, and browser-only performance instructions.',
  'Fake screenshots, fake precision, fake social proof, fake workers, and fake prices.',
])

function inferKind(task, surface) {
  const value = `${task} ${surface}`.toLocaleLowerCase()
  if (/visual bug|rendering bug|layout bug|broken layout|defect|regression/.test(value)) return 'visual-bug'
  if (/accessib|screen reader|dynamic type|contrast|label|diacrit/.test(value)) return 'accessibility'
  if (/adaptive|responsive|orientation|landscape|tablet|split-screen|keyboard|safe area/.test(value)) return 'adaptive-layout'
  if (/motion|animation|transition|gesture|skeleton|shimmer/.test(value)) return 'motion'
  if (/material|glass|blur|elevation|surface role/.test(value)) return 'material'
  if (/token|theme|typography system|color system|design system/.test(value)) return 'design-system'
  if (/research|compare|reference|evidence|source/.test(value)) return 'research'
  if (/polish|micro-interaction|detail pass/.test(value)) return 'polish'
  if (/flow|workflow|multi-screen|journey|intake/.test(value)) return 'flow'
  if (/component|button|card|modal|sheet|row|control/.test(value)) return 'component'
  return 'screen'
}

function inferMode(task, explicitMode) {
  if (explicitMode) return explicitMode
  const value = String(task).toLocaleLowerCase()
  if (/overhaul|from scratch|new visual language/.test(value)) return 'redesign-overhaul'
  if (/redesign|refactor|refresh|polish|improve|existing|rebuild/.test(value)) return 'redesign-preserve'
  return 'new'
}

function modeLabel(mode) {
  if (mode === 'redesign-overhaul') return 'an overhaul of'
  if (mode === 'redesign-preserve') return 'a preserve-and-improve redesign of'
  return 'a new'
}

export function inferDesignDirection({
  task = 'UI change',
  surface = 'NestScout mobile service surface',
  workflow = 'the current product workflow',
  audience = 'HCMC apartment residents and verified workers',
  vibe = 'trustworthy, polished, friendly, and operational',
  mode,
  designClass,
} = {}) {
  const resolvedMode = inferMode(task, mode)
  const kind = designClass ?? inferKind(task, surface)
  const wheel = wheelHandoffs[kind]
  const designRead = `Reading this as: ${modeLabel(resolvedMode)} ${surface} for ${audience}, with a ${vibe} language, leaning toward NestScout's professional mint service system and the existing Design Wheel.`

  return {
    task,
    surface,
    workflow,
    audience,
    vibe,
    mode: resolvedMode,
    kind,
    designRead,
    retainedPrinciples: [...retainedPrinciples],
    adaptations: [
      'Use workflow surface classes rather than landing-page categories.',
      'Preserve NestScout identity, Vietnamese-first copy, and current token ownership.',
      'Defer material, motion, accessibility, adaptive, token, review, and frontend gates to the existing wheel spokes.',
    ],
    ignoredRules: [...ignoredRules],
    wheelHandoff: {
      class: kind,
      skills: [...wheel.skills],
      protocols: [...wheel.protocols],
      requiredFinalSkill: 'kael-frontend-test',
    },
    states: ['loading', 'empty', 'error', 'success', 'retry', 'confirmation'],
    verificationGates: [
      'React Native runtime, not browser-only evidence.',
      'VI and EN without mixed-mode copy.',
      'Light and dark theme with Reduce Motion and Reduce Transparency.',
      'Phone and large-width layout when the surface adapts.',
      'Objective checks separated from human taste sign-off.',
    ],
  }
}

export function formatDirectionMarkdown(direction) {
  return [
    '# Kael Design Direction',
    '',
    `Design Read: ${direction.designRead}`,
    `Surface and workflow: ${direction.surface} · ${direction.workflow}`,
    `Audience and constraints: ${direction.audience} · ${direction.vibe}`,
    `Mode: ${direction.mode}`,
    '',
    'Retained direction principles:',
    ...direction.retainedPrinciples.map((item) => `- ${item}`),
    '',
    'NestScout adaptations:',
    ...direction.adaptations.map((item) => `- ${item}`),
    '',
    'Ignored upstream rules:',
    ...direction.ignoredRules.map((item) => `- ${item}`),
    '',
    `Existing wheel class and skills: ${direction.wheelHandoff.class} → ${direction.wheelHandoff.skills.join(' + ')}`,
    `State and verification handoff: ${direction.states.join(' / ')} → ${direction.verificationGates.join(' · ')}`,
    '',
  ].join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  try {
    const direction = inferDesignDirection({
      task: args.task ?? args._[0] ?? 'UI change',
      surface: args.surface ?? 'NestScout mobile service surface',
      workflow: args.workflow ?? 'the current product workflow',
      audience: args.audience ?? 'HCMC apartment residents and verified workers',
      vibe: args.vibe ?? 'trustworthy, polished, friendly, and operational',
      mode: args.mode,
      designClass: args.class,
    })
    process.stdout.write(args.format === 'json' ? `${JSON.stringify(direction, null, 2)}\n` : formatDirectionMarkdown(direction))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
