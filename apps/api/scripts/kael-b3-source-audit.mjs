#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const DEFAULT_DOC = resolve(REPO_ROOT, 'docs/foundation/kael-knowledge-corpus.md')
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, 'docs/foundation/source-trust-samples')
const PERPLEXITY_URL = process.env.PERPLEXITY_API_URL ?? 'https://api.perplexity.ai/v1/sonar'

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main() {
  if (process.env.KAEL_B3_SOURCE_AUDIT_LIVE !== '1') {
    throw new Error('Set KAEL_B3_SOURCE_AUDIT_LIVE=1 to run live B3 source audit calls.')
  }
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY.')

  const args = parseArgs(process.argv.slice(2))
  const docPath = args.doc ? resolve(process.cwd(), args.doc) : DEFAULT_DOC
  const outputDir = args.outputDir
    ? resolve(process.cwd(), args.outputDir)
    : DEFAULT_OUTPUT_DIR
  const doc = await readFile(docPath, 'utf-8')
  const sources = parseSources(doc)
  if (sources.length < 8) throw new Error(`Expected at least 8 B3 sources, got ${sources.length}.`)

  await mkdir(outputDir, { recursive: true })
  const startedAt = new Date().toISOString()
  const results = []

  for (const source of sources) {
    const response = await callPerplexity(apiKey, source)
    const directUrl = await checkDirectUrl(source.url)
    results.push({
      ...source,
      ...summarizeResult(source, response, directUrl),
      response,
      direct_url: directUrl,
    })
  }

  const payload = {
    run_id: `kael-b3-source-audit-${Date.now()}`,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    perplexity_url: PERPLEXITY_URL,
    corpus_doc: relativeToRepo(docPath),
    source_count: sources.length,
    summary: summarizeRun(results),
    results,
  }
  const outputPath = resolve(outputDir, `${payload.run_id}.json`)
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8')

  console.log(JSON.stringify({
    ok: payload.summary.failed_sources === 0,
    output_path: outputPath,
    run_id: payload.run_id,
    source_count: payload.source_count,
    on_domain_sources: payload.summary.on_domain_sources,
    failed_sources: payload.summary.failed_sources,
  }, null, 2))

  if (payload.summary.failed_sources > 0) process.exitCode = 1
}

function parseArgs(args) {
  const parsed = { doc: null, outputDir: null }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--doc') {
      parsed.doc = requireArg(args, index, arg)
      index += 1
      continue
    }
    if (arg === '--output-dir') {
      parsed.outputDir = requireArg(args, index, arg)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return parsed
}

function requireArg(args, index, name) {
  const value = args[index + 1]
  if (!value) throw new Error(`${name} requires a value`)
  return value
}

function parseSources(doc) {
  const sourceUrls = new Map()
  for (const line of doc.split(/\r?\n/)) {
    const match = line.match(/^- (S\d+):\s+(https?:\/\/\S+)/)
    if (match) sourceUrls.set(match[1], match[2])
  }

  const sources = []
  for (const line of doc.split(/\r?\n/)) {
    const cells = markdownCells(line)
    if (cells.length < 4 || !/^S\d+$/.test(cells[0])) continue
    const url = sourceUrls.get(cells[0])
    if (!url) throw new Error(`Missing URL for source ${cells[0]}`)
    const hostname = hostnameFromUrl(url)
    sources.push({
      ref: cells[0],
      source_label: cells[1],
      trust_proposal: cells[2],
      evidence_used: cells[3],
      url,
      domain: rootDomain(hostname),
      host: hostname,
    })
  }
  return sources
}

function markdownCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return []
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
}

function hostnameFromUrl(value) {
  const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  if (!/^[a-z0-9.-]+$/.test(host)) throw new Error(`Invalid host: ${host}`)
  return host
}

function rootDomain(host) {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  if (host.endsWith('.gov.vn') || host.endsWith('.com.vn')) return parts.slice(-3).join('.')
  return parts.slice(-2).join('.')
}

async function callPerplexity(apiKey, source) {
  const response = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      max_tokens: 320,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Audit source evidence for a Vietnamese home-services safety/legal corpus. Return concise Vietnamese notes. Do not invent citations.',
        },
        {
          role: 'user',
          content: `Source ref: ${source.ref}
URL: ${source.url}
Evidence claim to verify: ${source.evidence_used}
Question: Does this source support the evidence claim for safe HCMC apartment electrical/plumbing/cleaning/legal-awareness guidance?`,
        },
      ],
      search_domain_filter: [source.domain],
      web_search_options: {
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
    search_results: Array.isArray(json?.search_results)
      ? json.search_results.map((item) => ({
        title: typeof item?.title === 'string' ? item.title : null,
        url: typeof item?.url === 'string' ? item.url : null,
      }))
      : [],
    content_length: typeof json?.choices?.[0]?.message?.content === 'string'
      ? json.choices[0].message.content.length
      : 0,
    error: response.ok ? null : json?.error ?? json,
  }
}

async function checkDirectUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (head.ok) {
      return directResult(head, 'HEAD')
    }
    const get = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-2047' },
      signal: controller.signal,
    })
    return directResult(get, 'GET')
  } catch (error) {
    return {
      ok: false,
      method: 'HEAD_THEN_GET',
      status: null,
      content_type: null,
      final_url_host_matches: false,
      error: error instanceof Error ? error.name : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

function directResult(response, method) {
  return {
    ok: response.ok,
    method,
    status: response.status,
    content_type: response.headers.get('content-type'),
    final_url_host_matches: true,
    error: null,
  }
}

function summarizeResult(source, response, directUrl) {
  const citationUrls = response.citations.filter((url) => typeof url === 'string')
  const searchUrls = response.search_results
    .map((item) => item.url)
    .filter((url) => typeof url === 'string')
  const urls = [...citationUrls, ...searchUrls]
  const onDomainUrls = urls.filter((url) => urlMatchesSource(url, source))
  const verified = onDomainUrls.length > 0 || directUrl.ok === true
  return {
    live_status: response.ok ? 'ok' : 'http_error',
    on_domain_signal: onDomainUrls.length > 0,
    direct_url_signal: directUrl.ok === true,
    verified_signal: verified,
    on_domain_url_count: onDomainUrls.length,
    citation_count: citationUrls.length,
    search_result_count: searchUrls.length,
    outside_domain_urls: urls.filter((url) => !urlMatchesSource(url, source)).slice(0, 10),
  }
}

function summarizeRun(results) {
  return {
    ok_sources: results.filter((item) => item.live_status === 'ok').length,
    on_domain_sources: results.filter((item) => item.on_domain_signal).length,
    direct_url_sources: results.filter((item) => item.direct_url_signal).length,
    verified_sources: results.filter((item) => item.verified_signal).length,
    failed_sources: results.filter((item) => item.live_status !== 'ok' || !item.verified_signal).length,
    outside_domain_url_count: results.reduce((sum, item) => sum + item.outside_domain_urls.length, 0),
  }
}

function urlMatchesSource(value, source) {
  try {
    const host = hostnameFromUrl(value)
    return host === source.host ||
      host.endsWith(`.${source.host}`) ||
      host === source.domain ||
      host.endsWith(`.${source.domain}`)
  } catch {
    return false
  }
}

function relativeToRepo(path) {
  return path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length + 1).replace(/\\/g, '/') : path
}
