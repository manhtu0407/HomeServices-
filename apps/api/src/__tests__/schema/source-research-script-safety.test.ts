import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertPublicHttpsUrl,
  assertTrustedPerplexityUrl,
  fetchWithTimeout,
  resolveWorkspacePath,
} from '../../../../../scripts/lib/research-network-safety.mjs'

const root = resolve(__dirname, '../../../../../')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const sandboxes: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

describe('source research script safety', () => {
  it('centralizes endpoint, timeout, public-network, redirect, and workspace guards', () => {
    const helper = read('scripts/lib/research-network-safety.mjs')

    expect(helper).toContain('assertTrustedPerplexityUrl')
    expect(helper).toContain('resolveWorkspacePath')
    expect(helper).toContain('fetchWithTimeout')
    expect(helper).toContain('fetchTrustedPublicUrl')
    expect(helper).toContain("redirect: 'manual'")
    expect(helper).toContain("lookup(hostname, { all: true")
    expect(helper).toContain("hostname === 'api.perplexity.ai'")
    expect(helper).toContain("pathname === '/v1/sonar'")
  })

  it('keeps the R1 Perplexity key on the trusted endpoint and bounds output and requests', () => {
    const script = read('scripts/source-trust-research/run-perplexity-r1.mjs')

    expect(script).toContain('assertTrustedPerplexityUrl')
    expect(script).toContain('resolveWorkspacePath')
    expect(script).toContain('fetchWithTimeout')
    expect(script).not.toMatch(/(?<!WithTimeout)\bfetch\(/)
  })

  it('keeps B3 source checks on public HTTPS hops and verifies the final redirect host', () => {
    const script = read('apps/api/scripts/kael-b3-source-audit.mjs')

    expect(script).toContain('assertTrustedPerplexityUrl')
    expect(script).toContain('resolveWorkspacePath')
    expect(script).toContain('fetchWithTimeout')
    expect(script).toContain('fetchTrustedPublicUrl')
    expect(script).toContain('urlMatchesSource(response.url, source)')
    expect(script).not.toMatch(/(?<!WithTimeout|TrustedPublicUrl)\bfetch\(/)
  })

  it('rejects credential exfiltration, private source hosts, and output traversal', () => {
    expect(assertTrustedPerplexityUrl()).toBe('https://api.perplexity.ai/v1/sonar')
    expect(() => assertTrustedPerplexityUrl('https://attacker.example/v1/sonar')).toThrow(
      'trusted Perplexity Sonar endpoint',
    )
    expect(() => assertPublicHttpsUrl('http://example.com/source')).toThrow('must use HTTPS')
    expect(() => assertPublicHttpsUrl('https://127.0.0.1/source')).toThrow('public DNS hostname')
    expect(() => resolveWorkspacePath(root, '../outside', 'output')).toThrow('inside the repository')
    expect(resolveWorkspacePath(root, 'docs/foundation', 'output')).toBe(
      resolve(root, 'docs/foundation'),
    )
    expect(resolveWorkspacePath(root, 'docs/foundation/future-run/output.json', 'output')).toBe(
      resolve(root, 'docs/foundation/future-run/output.json'),
    )
  })

  it('rejects an output path whose nearest existing ancestor escapes through a junction', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'nestscout-research-output-'))
    sandboxes.push(fixtureRoot)
    const workspace = join(fixtureRoot, 'workspace')
    const outside = join(fixtureRoot, 'outside')
    mkdirSync(workspace)
    mkdirSync(outside)
    symlinkSync(outside, join(workspace, 'output'), process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => resolveWorkspacePath(workspace, 'output/run.json', 'output')).toThrow(
      'physical path must stay inside the repository workspace',
    )
  })

  it('aborts stalled research requests', async () => {
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })))

    await expect(fetchWithTimeout('https://api.perplexity.ai/v1/sonar', {}, 5)).rejects.toThrow(
      'Research request timed out after 5ms',
    )
  })

  it('rejects redirects for credentialed research requests while preserving manual source checks', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(null, { status: 204 })
    ))
    vi.stubGlobal('fetch', fetchMock)

    await fetchWithTimeout('https://api.perplexity.ai/v1/sonar', { redirect: 'follow' }, 100)
    await fetchWithTimeout('https://example.com/source', { redirect: 'manual' }, 100)

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'error' }))
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ redirect: 'manual' }))
  })
})
