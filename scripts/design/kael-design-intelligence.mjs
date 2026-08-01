import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { asList, asPositiveInt, loadCsv, parseArgs, tokenize } from './csv.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const corpusRoot = resolve(root, 'docs/design-research/corpus/ui-ux-pro-max')
const manifestPath = resolve(root, 'docs/design-research/corpus/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

export const DOMAIN_FILES = Object.freeze({
  product: 'products.csv',
  style: 'styles.csv',
  color: 'colors.csv',
  typography: 'typography.csv',
  ux: 'ux-guidelines.csv',
  'ui-reasoning': 'ui-reasoning.csv',
  'react-native': 'react-native.csv',
})

const defaultDomains = Object.freeze([
  'product',
  'ux',
  'ui-reasoning',
  'react-native',
])

const stopWords = new Set([
  'a', 'an', 'and', 'app', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with',
  'mobile', 'screen', 'surface', 'ui', 'ux',
])

const synonyms = Object.freeze({
  apartment: ['home', 'housing', 'residential'],
  booking: ['intake', 'appointment', 'request', 'form'],
  customer: ['user', 'client', 'resident'],
  error: ['failure', 'fallback', 'retry'],
  repair: ['service', 'maintenance', 'task'],
  trust: ['accessibility', 'clear', 'evidence', 'verification'],
  worker: ['provider', 'technician'],
})

const domainWeights = Object.freeze({
  product: ['Product Type', 'Keywords', 'Primary Style Recommendation', 'Key Considerations'],
  style: ['Style Category', 'Type', 'Keywords', 'Best For', 'Do Not Use For'],
  color: ['Color Name', 'Keywords', 'Mood', 'Primary', 'Secondary'],
  typography: ['Pairing Name', 'Keywords', 'Heading Font', 'Body Font', 'Mood'],
  ux: ['Category', 'Issue', 'Platform', 'Description', 'Do', "Don't"],
  'ui-reasoning': ['UI_Category', 'Recommended_Pattern', 'Style_Priority', 'Decision_Rules', 'Anti_Patterns'],
  'react-native': ['Category', 'Guideline', 'Description', 'Do', "Don't"],
})

const summaryFields = Object.freeze({
  product: ['Product Type', 'Keywords', 'Primary Style Recommendation', 'Color Palette Focus', 'Key Considerations'],
  style: ['Style Category', 'Type', 'Primary Colors', 'Effects & Animation', 'Best For', 'Do Not Use For', 'Performance', 'Accessibility'],
  color: ['Color Name', 'Keywords', 'Mood', 'Primary', 'Secondary', 'Notes'],
  typography: ['Pairing Name', 'Heading Font', 'Body Font', 'Mood', 'Best For', 'Notes'],
  ux: ['Category', 'Issue', 'Platform', 'Description', 'Do', "Don't", 'Severity', 'Docs URL'],
  'ui-reasoning': ['UI_Category', 'Recommended_Pattern', 'Style_Priority', 'Color_Mood', 'Typography_Mood', 'Decision_Rules', 'Anti_Patterns', 'Severity'],
  'react-native': ['Category', 'Guideline', 'Description', 'Do', "Don't", 'Severity', 'Docs URL'],
})

const cache = new Map()

function loadDomain(domain) {
  if (!DOMAIN_FILES[domain]) throw new Error(`Unknown design intelligence domain: ${domain}`)
  if (!cache.has(domain)) cache.set(domain, loadCsv(resolve(corpusRoot, DOMAIN_FILES[domain])))
  return cache.get(domain)
}

function expandQuery(query) {
  const terms = new Set()
  for (const token of tokenize(query)) {
    if (stopWords.has(token)) continue
    terms.add(token)
    for (const synonym of synonyms[token] ?? []) terms.add(synonym)
  }
  return [...terms]
}

function textTokens(value) {
  return new Set(tokenize(value))
}

function isAllowedRow(domain, row, stack) {
  if (stack !== 'react-native') return true
  if (domain !== 'ux') return true
  return !/^web$/i.test(row.Platform ?? '')
}

function rowScore(domain, row, query, terms) {
  const primaryFields = new Set(domainWeights[domain] ?? [])
  const normalizedRow = Object.values(row).join(' ').toLocaleLowerCase()
  const normalizedQuery = String(query).toLocaleLowerCase().trim()
  let score = normalizedQuery && normalizedRow.includes(normalizedQuery) ? 8 : 0

  for (const term of terms) {
    let matched = false
    for (const [field, value] of Object.entries(row)) {
      if (!textTokens(value).has(term)) continue
      score += primaryFields.has(field) ? 4 : 1
      matched = true
    }
    if (matched && term.length > 5) score += 0.5
  }

  if (domain === 'react-native' && /native|expo|reanimated|pressable|accessibility|list|state|layout/i.test(normalizedQuery)) score += 1
  if (domain === 'ux' && /accessibility|state|loading|error|retry|touch|motion|safe|keyboard/i.test(normalizedQuery)) score += 1
  return score
}

function summarize(domain, row, score) {
  const fields = summaryFields[domain] ?? Object.keys(row)
  const summary = Object.fromEntries(fields.filter((field) => row[field]).map((field) => [field, row[field]]))
  return { domain, score: Number(score.toFixed(2)), ...summary }
}

export function searchDesignIntelligence({ query, stack = 'react-native', domains = defaultDomains, limit = 3 } = {}) {
  if (!query || !String(query).trim()) throw new Error('A non-empty --query is required')
  const selectedDomains = domains.length > 0 ? domains : [...defaultDomains]
  const terms = expandQuery(query)
  const results = []

  for (const domain of selectedDomains) {
    const { rows } = loadDomain(domain)
    rows.forEach((row, index) => {
      if (!isAllowedRow(domain, row, stack)) return
      const score = rowScore(domain, row, query, terms)
      if (score > 0) results.push({ ...summarize(domain, row, score), _index: index })
    })
  }

  results.sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain) || left._index - right._index)
  const perDomain = new Map()
  const selected = []
  for (const result of results) {
    const count = perDomain.get(result.domain) ?? 0
    if (count >= limit) continue
    perDomain.set(result.domain, count + 1)
    const { _index, ...publicResult } = result
    selected.push(publicResult)
  }

  return {
    query: String(query).trim(),
    stack,
    domains: selectedDomains,
    source: {
      name: 'ui-ux-pro-max',
      repository: manifest.sources['ui-ux-pro-max'].repository,
      commit: manifest.sources['ui-ux-pro-max'].commit,
      corpus: 'docs/design-research/corpus/ui-ux-pro-max',
      nonNormative: true,
    },
    adaptation: stack === 'react-native'
      ? [
        'React Native searches exclude UX rows marked Web.',
        'Results are candidates for the existing Design Wheel, not production decisions.',
        'NestScout tokens, workflow truth, accessibility, motion, and data honesty outrank these results.',
      ]
      : ['Results are non-normative candidates for the existing Design Wheel.'],
    results: selected,
  }
}

function markdownValue(value) {
  return String(value).replace(/\r?\n/g, ' ').trim()
}

export function formatMarkdown(report) {
  const lines = [
    '# Kael Design Intelligence',
    '',
    `Query: ${report.query}`,
    `Stack: ${report.stack}`,
    `Source: ${report.source.name}@${report.source.commit}`,
    '',
    'Adaptation:',
    ...report.adaptation.map((item) => `- ${item}`),
    '',
  ]

  for (const result of report.results) {
    lines.push(`## ${result.domain} · score ${result.score}`)
    for (const [key, value] of Object.entries(result)) {
      if (key === 'domain' || key === 'score') continue
      lines.push(`- ${key}: ${markdownValue(value)}`)
    }
    lines.push('')
  }

  if (report.results.length === 0) lines.push('No matching non-normative corpus rows were found.')
  return lines.join('\n').trimEnd() + '\n'
}

function printUsage() {
  console.error('Usage: node scripts/design/kael-design-intelligence.mjs --query "..." [--stack react-native] [--domains product,ux] [--limit 3] [--format json|markdown]')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.query) {
    printUsage()
    process.exitCode = 1
    return
  }

  try {
    const report = searchDesignIntelligence({
      query: args.query,
      stack: args.stack ?? 'react-native',
      domains: asList(args.domains, [...defaultDomains]),
      limit: asPositiveInt(args.limit, 3),
    })
    process.stdout.write(args.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : formatMarkdown(report))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
