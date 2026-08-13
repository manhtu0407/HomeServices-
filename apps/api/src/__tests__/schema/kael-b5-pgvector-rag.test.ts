import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Plan §31 B5 pgvector knowledge RAG', () => {
  it('logs knowledge citations from the semantic retrieval path', () => {
    const knowledge = read('supabase/functions/mobile-api/_shared/kael/tools/knowledge.ts')

    expect(knowledge).toContain('kael_knowledge_usage_log')
    expect(knowledge).toContain('retrieveKnowledgeSemantic')
  })

  // The corpus migration was machine-generated from provider responses, so it is
  // scanned for a committed provider key rather than trusted by review alone.
  it('carries no provider key in the generated corpus migration', () => {
    const sql = read('supabase/migrations/20260604213000_kael_b5_pgvector_rag.sql')

    expect(sql).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
  })

})
