#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, 'docs/foundation/source-trust-samples')
const PERPLEXITY_URL = process.env.PERPLEXITY_API_URL ?? 'https://api.perplexity.ai/v1/sonar'

const CANDIDATE_DOMAINS = [
  'btaskee.com',
  'btaskee.work',
  'jupviec.vn',
  'rada.com.vn',
  'anvui.com',
  '247shome.com',
  'service.vn',
  'tuoitre.vn',
  'vnexpress.net',
  'thanhnien.vn',
  'dienmayxanh.com',
  'suachuatainha.com.vn',
  'thopro.vn',
  'tktclean.com',
  'cleanipedia.com',
  'cleanhouse.com.vn',
  'hoanmyclean.vn',
  'vesinhnhaviet.vn',
  'guvico.com',
  '6ixgo.com',
]

const QUERIES = [
  'Gia sua ong nuoc ro ri HCMC 2026',
  'Gia thay o cam dien apartment HCMC',
  'Gia don nha move-out HCMC 2026',
  'Gia sua van xa bon cau HCMC',
  'Gia ve sinh bep gas dau HCMC',
]

function requireLiveRun() {
  if (process.env.SOURCE_TRUST_RUN_LIVE !== '1') {
    throw new Error('Set SOURCE_TRUST_RUN_LIVE=1 to run Perplexity R1 research calls.')
  }
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY.')
  return apiKey
}

function validDomain(domain) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i
    .test(domain)
}

async function callPerplexity(apiKey, domain, query) {
  const response = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      max_tokens: 220,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Return concise Vietnamese market evidence for HCMC home services. Include only price-like facts and cite sources.',
        },
        { role: 'user', content: query },
      ],
      web_search_options: {
        search_domain_filter: [domain],
        search_recency_filter: 'year',
        search_mode: 'web',
        search_context_size: 'low',
      },
    }),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw_text: text.slice(0, 1000) }
  }
  return {
    ok: response.ok,
    status: response.status,
    citations: Array.isArray(json?.citations) ? json.citations : [],
    search_results: Array.isArray(json?.search_results) ? json.search_results : [],
    content: json?.choices?.[0]?.message?.content ?? null,
    error: response.ok ? null : json?.error ?? json,
  }
}

function summarizeDomain(domain, results) {
  const citations = results.flatMap((item) => item.citations)
  const searchResults = results.flatMap((item) => item.search_results)
  return {
    domain,
    valid_domain_format: validDomain(domain),
    calls: results.length,
    ok_calls: results.filter((item) => item.ok).length,
    citation_count: citations.length,
    search_result_count: searchResults.length,
    outside_domain_citations: citations.filter((url) => !urlHostMatches(url, domain)),
    statuses: [...new Set(results.map((item) => item.status))],
  }
}

function urlHostMatches(value, domain) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '')
    return host === domain || host.endsWith(`.${domain}`)
  } catch {
    return false
  }
}

async function main() {
  const apiKey = requireLiveRun()
  if (CANDIDATE_DOMAINS.length !== 20) {
    throw new Error(`Expected 20 candidate domains, got ${CANDIDATE_DOMAINS.length}.`)
  }
  for (const domain of CANDIDATE_DOMAINS) {
    if (!validDomain(domain)) throw new Error(`Invalid domain format: ${domain}`)
  }

  const outputDir = resolve(REPO_ROOT, process.env.SOURCE_TRUST_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR)
  await mkdir(outputDir, { recursive: true })
  const startedAt = new Date().toISOString()
  const domainResults = []

  for (const domain of CANDIDATE_DOMAINS) {
    const results = []
    for (const query of QUERIES) {
      results.push({ query, ...(await callPerplexity(apiKey, domain, query)) })
    }
    domainResults.push({
      ...summarizeDomain(domain, results),
      results,
    })
  }

  const payload = {
    run_id: `source-trust-r1-${Date.now()}`,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    perplexity_url: PERPLEXITY_URL,
    domains: CANDIDATE_DOMAINS,
    queries: QUERIES,
    summaries: domainResults.map(({ results: _results, ...summary }) => summary),
    domain_results: domainResults,
  }
  const outputPath = resolve(outputDir, `${payload.run_id}.json`)
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log(JSON.stringify({
    ok: true,
    output_path: outputPath,
    run_id: payload.run_id,
    domains: CANDIDATE_DOMAINS.length,
    queries: QUERIES.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
