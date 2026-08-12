import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Plan §31 B3 knowledge corpus draft gate', () => {
  const doc = read('docs/foundation/kael-knowledge-corpus.md')

  it('keeps the corpus as an approved sign-off package with a migration gate', () => {
    expect(doc).toContain('Status: `approved`')
    expect(doc).toContain('Research method:')
    expect(doc).toContain('Tu approved the corpus rows on 2026-06-04')
    expect(doc).toContain('kael-b3-source-audit-1780579373188.json')
    expect(doc).toContain('`failed_sources=0`')
    expect(doc).toContain('## Migration Gate')
    expect(doc).toContain('Do not create or apply a migration while any candidate row remains unapproved.')
  })

  it('covers supported services and legal boundaries with cited candidate rows only', () => {
    const sourceIds = new Set(
      [...doc.matchAll(/^\| (S\d+) \|/gm)].map((match) => match[1]),
    )
    const safetyRows = candidateRowsBetween(
      doc,
      '## Candidate `worker_safety_patterns`',
      '## Candidate `legal_awareness_patterns`',
    )
    const legalRows = candidateRowsBetween(
      doc,
      '## Candidate `legal_awareness_patterns`',
      '## Candidate `service_knowledge_boxes` / Problem Hints',
    )

    expect(safetyRows.length).toBeGreaterThanOrEqual(24)
    expect(legalRows.length).toBeGreaterThanOrEqual(8)
    for (const row of safetyRows) {
      expect(row.signoff).toBe('approved')
      expect(['electrical', 'plumbing', 'cleaning']).toContain(row.cells[2])
      expect(['urgent', 'warning', 'advisory']).toContain(row.cells[4])
      expect(row.cells[5]).not.toMatch(/090\d+|CCCD|STK|OTP/i)
      assertRefsExist(row.refs, sourceIds)
    }
    for (const row of legalRows) {
      expect(row.signoff).toBe('approved')
      expect(['awareness_only', 'redirect_required', 'emergency_redirect']).toContain(row.cells[3])
      expect(row.cells[4]).not.toMatch(/090\d+|CCCD|STK|OTP/i)
      assertRefsExist(row.refs, sourceIds)
    }
  })

  it('ships no migration still carrying the pending sign-off marker', () => {
    const migrations = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => read(`supabase/migrations/${name}`))
      .join('\n')

    expect(migrations).not.toContain('pending_tu_signoff')
  })

  it('fails closed before generating SQL while a corpus document still needs Tu sign-off', () => {
    const script = resolve(ROOT, 'apps/api/scripts/kael-b3-corpus-to-sql.mjs')
    const tempDir = mkdtempSync(join(tmpdir(), 'kael-b3-corpus-pending-'))
    const pendingDoc = join(tempDir, 'pending-corpus.md')
    writeFileSync(pendingDoc, doc.replace(/\| approved \|/g, '| pending_tu_signoff |'))

    expect(existsSync(script)).toBe(true)

    try {
      const result = spawnSync(process.execPath, [script, '--doc', pendingDoc], {
        cwd: ROOT,
        encoding: 'utf-8',
      })
      const output = `${result.stdout}\n${result.stderr}`

      expect(result.status).toBe(1)
      expect(output).toContain('B3_CORPUS_SIGNOFF_REQUIRED')
      expect(output).toContain('pending_tu_signoff')
      expect(output).toContain('worker_safety_patterns')
      expect(output).toContain('legal_awareness_patterns')
      expect(result.stdout).not.toMatch(/insert\s+into\s+public\./i)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('emits idempotent SQL for the approved corpus document', () => {
    const script = resolve(ROOT, 'apps/api/scripts/kael-b3-corpus-to-sql.mjs')
    const result = spawnSync(process.execPath, [script], {
      cwd: ROOT,
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
    expect(result.stdout).toContain('Plan §31 B3')
    expect(result.stdout).toContain('insert into public.worker_safety_patterns')
    expect(result.stdout).toContain('insert into public.legal_awareness_patterns')
    expect(result.stdout).toContain('update public.service_knowledge_boxes')
    expect(result.stdout).toContain('on conflict (pattern_key) do update')
    expect(result.stdout).toContain('"corpus_version":"b3-draft-2026-06-04"')
    expect(result.stdout).toContain('"signoff_status":"approved"')
    expect(result.stdout).toContain('"source_trust_score"')
    expect(result.stdout).toContain('"problem_hints"')
    expect(result.stdout).not.toContain('pending_tu_signoff')
  })

  it('provides an explicit live source-audit harness for B3 evidence', () => {
    const script = read('apps/api/scripts/kael-b3-source-audit.mjs')

    expect(script).toContain('KAEL_B3_SOURCE_AUDIT_LIVE')
    expect(script).toContain('PERPLEXITY_API_KEY')
    expect(script).toContain('search_domain_filter')
    expect(script).toContain('direct_url_signal')
    expect(script).toContain('docs/foundation/source-trust-samples')
    expect(script).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
  })
})

function candidateRowsBetween(doc: string, startMarker: string, endMarker: string) {
  const start = doc.indexOf(startMarker)
  const end = doc.indexOf(endMarker)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return doc
    .slice(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('| pending_tu_signoff |') || line.startsWith('| approved |'))
    .map((line) => {
      const cells = line.slice(1, -1).split('|').map((cell) => cell.trim())
      return {
        cells,
        signoff: cells[0],
        refs: cells.at(-1)?.split(',').map((ref) => ref.trim()).filter(Boolean) ?? [],
      }
    })
}

function assertRefsExist(refs: string[], sourceIds: Set<string>) {
  expect(refs.length).toBeGreaterThan(0)
  for (const ref of refs) expect(sourceIds.has(ref)).toBe(true)
}
