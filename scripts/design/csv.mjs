import { existsSync, readFileSync } from 'node:fs'

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  const flushField = () => {
    row.push(field)
    field = ''
  }

  const flushRow = () => {
    flushField()
    if (row.some((value) => value.trim() !== '')) rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (!quoted && character === ',') {
      flushField()
      continue
    }

    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      flushRow()
      continue
    }

    field += character
  }

  if (field !== '' || row.length > 0) flushRow()
  return rows
}

export function loadCsv(path) {
  if (!existsSync(path)) throw new Error(`Missing design corpus file: ${path}`)
  const rows = parseCsv(readFileSync(path, 'utf8'))
  if (rows.length === 0) throw new Error(`Empty design corpus file: ${path}`)
  const headers = rows[0].map((header, index) => {
    const normalized = header.replace(/^\uFEFF/, '').trim()
    return normalized || `column_${index + 1}`
  })

  return {
    headers,
    rows: rows.slice(1).map((values) => Object.fromEntries(
      headers.map((header, index) => [header, (values[index] ?? '').trim()]),
    )),
  }
}

export function tokenize(value) {
  return [...new Set(String(value ?? '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
}

export function parseArgs(argv) {
  const result = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      result._.push(argument)
      continue
    }

    const [rawKey, inlineValue] = argument.slice(2).split('=', 2)
    if (inlineValue !== undefined) {
      result[rawKey] = inlineValue
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      result[rawKey] = next
      index += 1
    } else {
      result[rawKey] = true
    }
  }

  return result
}

export function asList(value, fallback = []) {
  if (value === undefined || value === true || value === '') return fallback
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

export function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
