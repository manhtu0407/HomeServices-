#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CORPUS_VERSION = 'b3-draft-2026-06-04'
const SCRIPT_ID = 'kael-b3-corpus-to-sql'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const DEFAULT_DOC = resolve(REPO_ROOT, 'docs/foundation/kael-knowledge-corpus.md')

const SECTION_MARKERS = {
  safety: {
    table: 'worker_safety_patterns',
    start: '## Candidate `worker_safety_patterns`',
    end: '## Candidate `legal_awareness_patterns`',
  },
  legal: {
    table: 'legal_awareness_patterns',
    start: '## Candidate `legal_awareness_patterns`',
    end: '## Candidate `service_knowledge_boxes` / Problem Hints',
  },
  serviceKnowledge: {
    table: 'service_knowledge_boxes',
    start: '## Candidate `service_knowledge_boxes` / Problem Hints',
    end: '## Sign-off Checklist',
  },
}

const VALID_SERVICES = new Set(['electrical', 'plumbing', 'cleaning'])
const VALID_SEVERITIES = new Set(['urgent', 'warning', 'advisory'])
const VALID_BOUNDARY_TYPES = new Set(['awareness_only', 'redirect_required', 'emergency_redirect'])

main()

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      printHelp()
      return
    }

    const docPath = args.doc ? resolve(process.cwd(), args.doc) : DEFAULT_DOC
    const doc = readFileSync(docPath, 'utf-8').replace(/\r\n/g, '\n')
    const sources = parseSourceSet(doc)
    const safetyRows = parseSafetyRows(doc)
    const legalRows = parseLegalRows(doc)
    const serviceKnowledgeRows = parseServiceKnowledgeRows(doc)

    assertCorpusShape(safetyRows, legalRows, serviceKnowledgeRows, sources)

    const nonApproved = [
      ...safetyRows,
      ...legalRows,
      ...serviceKnowledgeRows,
    ].filter((row) => row.signoff !== 'approved')

    if (nonApproved.length > 0) {
      printSignoffRequired(nonApproved)
      process.exitCode = 1
      return
    }

    process.stdout.write(buildSql({ docPath, safetyRows, legalRows, serviceKnowledgeRows, sources }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`B3_CORPUS_SQL_ERROR: ${message}`)
    process.exitCode = 1
  }
}

function parseArgs(args) {
  const parsed = { doc: null, help: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    if (arg === '--doc') {
      const value = args[index + 1]
      if (!value) throw new Error('--doc requires a markdown file path')
      parsed.doc = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return parsed
}

function printHelp() {
  process.stdout.write(`Usage: node apps/api/scripts/kael-b3-corpus-to-sql.mjs [--doc path]\n\n`)
  process.stdout.write('Reads the Plan §31 B3 corpus markdown and prints approved seed SQL to stdout.\n')
  process.stdout.write('Fails closed while any candidate row is not approved.\n')
}

function printSignoffRequired(rows) {
  const counts = rows.reduce((acc, row) => {
    const key = `${row.table}:${row.signoff}`
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  console.error('B3_CORPUS_SIGNOFF_REQUIRED: refusing to generate SQL while candidate rows are not approved.')
  for (const [key, count] of Object.entries(counts).sort()) {
    const [table, signoff] = key.split(':')
    console.error(`- ${table}: ${count} row(s) with signoff ${signoff}`)
  }
  console.error('Tu sign-off is required before creating or applying a B3 seed migration.')
}

function assertCorpusShape(safetyRows, legalRows, serviceKnowledgeRows, sources) {
  if (sources.size === 0) throw new Error('Source Set is empty or malformed')
  if (safetyRows.length < 24) throw new Error(`Expected at least 24 safety rows, got ${safetyRows.length}`)
  if (legalRows.length < 8) throw new Error(`Expected at least 8 legal rows, got ${legalRows.length}`)
  if (serviceKnowledgeRows.length < 3) {
    throw new Error(`Expected service knowledge sign-off rows, got ${serviceKnowledgeRows.length}`)
  }

  for (const row of safetyRows) {
    if (!VALID_SERVICES.has(row.serviceType)) {
      throw new Error(`${row.patternKey}: unsupported service_type ${row.serviceType}`)
    }
    if (!VALID_SEVERITIES.has(row.severity)) {
      throw new Error(`${row.patternKey}: unsupported severity ${row.severity}`)
    }
    assertPatternKey(row.patternKey)
    assertRefs(row, sources)
  }

  for (const row of legalRows) {
    if (!VALID_BOUNDARY_TYPES.has(row.boundaryType)) {
      throw new Error(`${row.patternKey}: unsupported boundary_type ${row.boundaryType}`)
    }
    assertPatternKey(row.patternKey)
    assertRefs(row, sources)
  }

  for (const row of serviceKnowledgeRows) {
    if (!VALID_SERVICES.has(row.serviceType)) {
      throw new Error(`service_knowledge_boxes: unsupported service_type ${row.serviceType}`)
    }
    if (!isPlainObject(row.safeMetadata.problem_hints)) {
      throw new Error(`${row.serviceType}: missing safe_metadata.problem_hints`)
    }
    assertRefs(row, sources)
  }
}

function parseSourceSet(doc) {
  const sources = new Map()
  for (const line of doc.split('\n')) {
    const cells = markdownCells(line)
    if (cells.length < 4 || !/^S\d+$/.test(cells[0])) continue
    sources.set(cells[0], {
      ref: cells[0],
      label: cells[1],
      trustScore: parseTrustScore(cells[2]),
    })
  }
  return sources
}

function parseTrustScore(value) {
  const match = value.match(/\b(?:0(?:\.\d+)?|1(?:\.0+)?)\b/)
  if (!match) throw new Error(`Missing source trust score in: ${value}`)
  const parsed = Number(match[0])
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid source trust score: ${value}`)
  }
  return parsed
}

function parseSafetyRows(doc) {
  return candidateRowsBetween(
    doc,
    SECTION_MARKERS.safety.start,
    SECTION_MARKERS.safety.end,
    SECTION_MARKERS.safety.table,
  ).map((row) => {
    assertCellCount(row, 7)
    return {
      ...row,
      patternKey: row.cells[1],
      serviceType: row.cells[2],
      triggerTopic: row.cells[3],
      severity: row.cells[4],
      responseGuidance: row.cells[5],
      refs: parseRefs(row.cells[6]),
    }
  })
}

function parseLegalRows(doc) {
  return candidateRowsBetween(
    doc,
    SECTION_MARKERS.legal.start,
    SECTION_MARKERS.legal.end,
    SECTION_MARKERS.legal.table,
  ).map((row) => {
    assertCellCount(row, 6)
    return {
      ...row,
      patternKey: row.cells[1],
      topic: row.cells[2],
      boundaryType: row.cells[3],
      responseGuidance: row.cells[4],
      refs: parseRefs(row.cells[5]),
    }
  })
}

function parseServiceKnowledgeRows(doc) {
  return candidateRowsBetween(
    doc,
    SECTION_MARKERS.serviceKnowledge.start,
    SECTION_MARKERS.serviceKnowledge.end,
    SECTION_MARKERS.serviceKnowledge.table,
  ).map((row) => {
    assertCellCount(row, 3)
    const safeMetadata = parseInlineJson(row.cells[2], row.cells[1])
    const refs = Array.isArray(safeMetadata.primary_refs)
      ? safeMetadata.primary_refs.filter((ref) => typeof ref === 'string' && ref.length > 0)
      : []
    return {
      ...row,
      serviceType: row.cells[1],
      safeMetadata,
      refs,
    }
  })
}

function parseGenericCandidateRows(doc, startMarker, endMarker, table) {
  return candidateRowsBetween(doc, startMarker, endMarker, table).map((row) => ({
    ...row,
    refs: [],
  }))
}

function parseInlineJson(value, label) {
  const trimmed = value.trim()
  const json = trimmed.startsWith('`') && trimmed.endsWith('`')
    ? trimmed.slice(1, -1)
    : trimmed
  try {
    const parsed = JSON.parse(json)
    if (!isPlainObject(parsed)) throw new Error('not an object')
    return parsed
  } catch (error) {
    throw new Error(`${label}: invalid service knowledge metadata JSON`)
  }
}

function candidateRowsBetween(doc, startMarker, endMarker, table) {
  const start = doc.indexOf(startMarker)
  const end = doc.indexOf(endMarker)
  if (start < 0) throw new Error(`Missing section marker: ${startMarker}`)
  if (end <= start) throw new Error(`Missing section end marker after: ${startMarker}`)

  return doc
    .slice(start, end)
    .split('\n')
    .map((line) => markdownCells(line))
    .filter((cells) => cells.length > 0)
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)))
    .filter((cells) => ['pending_tu_signoff', 'approved'].includes(cells[0]))
    .map((cells) => ({
      table,
      signoff: cells[0],
      cells,
    }))
}

function markdownCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return []
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
}

function assertCellCount(row, minimum) {
  if (row.cells.length < minimum) {
    throw new Error(`${row.table}: malformed candidate row with ${row.cells.length} cells`)
  }
}

function assertPatternKey(value) {
  if (!/^[a-z][a-z0-9_]{2,119}$/.test(value)) {
    throw new Error(`Invalid pattern_key: ${value}`)
  }
}

function parseRefs(value) {
  return value.split(',').map((ref) => ref.trim()).filter(Boolean)
}

function assertRefs(row, sources) {
  if (row.refs.length === 0) throw new Error(`${row.patternKey}: missing source refs`)
  for (const ref of row.refs) {
    if (!sources.has(ref)) throw new Error(`${row.patternKey}: unknown source ref ${ref}`)
  }
}

function buildSql({ docPath, safetyRows, legalRows, serviceKnowledgeRows, sources }) {
  const safetyValues = safetyRows.map((row) =>
    `  (${[
      sqlString(row.patternKey),
      sqlString(row.serviceType),
      sqlString(row.triggerTopic),
      sqlString(row.severity),
      sqlString(row.responseGuidance),
      sqlJson(metadataFor(row, sources)),
      'true',
    ].join(', ')})`
  ).join(',\n')

  const legalValues = legalRows.map((row) =>
    `  (${[
      sqlString(row.patternKey),
      sqlString(row.topic),
      sqlString(row.boundaryType),
      sqlString(row.responseGuidance),
      sqlJson(metadataFor(row, sources)),
      'true',
    ].join(', ')})`
  ).join(',\n')

  const serviceKnowledgeUpdates = serviceKnowledgeRows.map((row) =>
    [
      'update public.service_knowledge_boxes',
      `set safe_metadata = safe_metadata || ${sqlJson(serviceKnowledgeMetadataFor(row, sources))},`,
      '    is_active = true,',
      '    updated_at = now()',
      `where service_type = ${sqlString(row.serviceType)}::public.service_type;`,
    ].join('\n')
  ).join('\n\n')

  return [
    '-- Plan §31 B3 Kael approved knowledge corpus seed.',
    `-- Generated by ${SCRIPT_ID} from ${relativeToRepo(docPath)}.`,
    `-- Corpus version: ${CORPUS_VERSION}. Review before saving as a migration.`,
    '',
    'begin;',
    '',
    'insert into public.worker_safety_patterns (',
    '  pattern_key,',
    '  service_type,',
    '  trigger_topic,',
    '  severity,',
    '  response_guidance,',
    '  safe_metadata,',
    '  is_enabled',
    ') values',
    safetyValues,
    'on conflict (pattern_key) do update set',
    '  service_type = excluded.service_type,',
    '  trigger_topic = excluded.trigger_topic,',
    '  severity = excluded.severity,',
    '  response_guidance = excluded.response_guidance,',
    '  safe_metadata = excluded.safe_metadata,',
    '  is_enabled = excluded.is_enabled,',
    '  updated_at = now();',
    '',
    'insert into public.legal_awareness_patterns (',
    '  pattern_key,',
    '  topic,',
    '  boundary_type,',
    '  response_guidance,',
    '  safe_metadata,',
    '  is_enabled',
    ') values',
    legalValues,
    'on conflict (pattern_key) do update set',
    '  topic = excluded.topic,',
    '  boundary_type = excluded.boundary_type,',
    '  response_guidance = excluded.response_guidance,',
    '  safe_metadata = excluded.safe_metadata,',
    '  is_enabled = excluded.is_enabled,',
    '  updated_at = now();',
    '',
    serviceKnowledgeUpdates,
    '',
    'commit;',
    '',
  ].join('\n')
}

function metadataFor(row, sources) {
  return {
    corpus_version: CORPUS_VERSION,
    signoff_status: 'approved',
    source_refs: row.refs,
    source_trust_score: sourceTrustScore(row.refs, sources),
    source_trust_scoring: 'source_set_minimum_trust_proposal',
    generated_by: SCRIPT_ID,
  }
}

function serviceKnowledgeMetadataFor(row, sources) {
  return {
    ...row.safeMetadata,
    corpus_version: CORPUS_VERSION,
    problem_hint_version: CORPUS_VERSION,
    signoff_status: 'approved',
    source_refs: row.refs,
    source_trust_score: sourceTrustScore(row.refs, sources),
    source_trust_scoring: 'source_set_minimum_trust_proposal',
    generated_by: SCRIPT_ID,
  }
}

function sourceTrustScore(refs, sources) {
  const scores = refs.map((ref) => sources.get(ref)?.trustScore)
  if (scores.some((score) => typeof score !== 'number')) {
    throw new Error(`Missing source trust score for refs: ${refs.join(', ')}`)
  }
  return Math.min(...scores)
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`
}

function relativeToRepo(path) {
  return path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length + 1).replace(/\\/g, '/') : path
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
