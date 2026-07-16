import { lookup } from 'node:dns/promises'
import { existsSync, realpathSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const DEFAULT_PERPLEXITY_URL = 'https://api.perplexity.ai/v1/sonar'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const PRIVATE_HOST_SUFFIXES = ['.internal', '.lan', '.local', '.localhost']

export function assertTrustedPerplexityUrl(raw = DEFAULT_PERPLEXITY_URL) {
  const url = new URL(raw)
  const trusted = url.protocol === 'https:' &&
    url.hostname === 'api.perplexity.ai' &&
    url.port === '' &&
    url.pathname === '/v1/sonar' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  if (!trusted) {
    throw new Error('PERPLEXITY_API_URL must be the trusted Perplexity Sonar endpoint')
  }
  return url.href
}

export function resolveWorkspacePath(repoRoot, candidate, label = 'Path') {
  const root = resolve(repoRoot)
  const target = resolve(root, candidate)
  const fromRoot = relative(root, target)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..\\`) ||
    fromRoot.startsWith('../') || isAbsolute(fromRoot)) {
    throw new Error(`${label} must stay inside the repository workspace`)
  }

  const physicalRoot = realpathSync(root)
  let existingAncestor = target
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor)
    if (parent === existingAncestor) {
      throw new Error(`${label} physical path could not be resolved`)
    }
    existingAncestor = parent
  }
  const physicalAncestor = realpathSync(existingAncestor)
  const physicalRelative = relative(physicalRoot, physicalAncestor)
  if (physicalRelative === '..' || physicalRelative.startsWith(`..\\`) ||
    physicalRelative.startsWith('../') || isAbsolute(physicalRelative)) {
    throw new Error(`${label} physical path must stay inside the repository workspace`)
  }
  return target
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = readTimeoutMs()) {
  const controller = new AbortController()
  const externalSignal = init.signal
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      redirect: init.redirect === 'manual' ? 'manual' : 'error',
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(`Research request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

export async function fetchTrustedPublicUrl(raw, init = {}) {
  rejectSensitiveHeaders(init.headers)
  let current = assertPublicHttpsUrl(raw)
  const maxRedirects = 5

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicDns(current.hostname)
    const response = await fetchWithTimeout(current, { ...init, redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    if (redirectCount === maxRedirects) {
      await response.body?.cancel()
      throw new Error(`Source URL exceeded ${maxRedirects} redirects`)
    }
    const next = assertPublicHttpsUrl(new URL(location, current).href)
    await response.body?.cancel()
    current = next
  }

  throw new Error('Source URL redirect loop was not resolved')
}

export function assertPublicHttpsUrl(raw) {
  const url = new URL(raw)
  const hostname = normalizeHostname(url.hostname)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Source URL must use HTTPS without embedded credentials')
  }
  if (isIP(hostname) !== 0 || hostname === 'localhost' || !hostname.includes('.') ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error('Source URL must use a public DNS hostname')
  }
  return url
}

async function assertPublicDns(hostname) {
  const timeoutMs = readTimeoutMs()
  const records = await withTimeout(
    lookup(hostname, { all: true, verbatim: true }),
    timeoutMs,
    `DNS lookup timed out after ${timeoutMs}ms`,
  )
  if (records.length === 0 || records.some(({ address }) => !isPublicAddress(address))) {
    throw new Error(`Source hostname did not resolve exclusively to public addresses: ${hostname}`)
  }
}

function rejectSensitiveHeaders(headersInit) {
  const headers = new Headers(headersInit)
  if (headers.has('authorization') || headers.has('cookie') || headers.has('proxy-authorization')) {
    throw new Error('Direct source requests must not carry credential headers')
  }
}

function isPublicAddress(address) {
  const normalized = normalizeHostname(address)
  const family = isIP(normalized)
  if (family === 4) return isPublicIpv4(normalized)
  if (family === 6) return isPublicIpv6(normalized)
  return false
}

function isPublicIpv4(address) {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) {
    return false
  }
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isPublicIpv6(address) {
  const value = address.toLowerCase()
  if (value === '::' || value === '::1') return false
  if (/^(?:fc|fd|fe[89ab]|ff)/.test(value)) return false
  if (value.startsWith('2001:db8:') || value === '2001:db8::') return false
  if (value.startsWith('100:')) return false
  if (value.startsWith('::ffff:')) {
    const mappedAddress = parseMappedIpv4(value.slice(7))
    return mappedAddress !== null && isPublicIpv4(mappedAddress)
  }
  return true
}

function parseMappedIpv4(suffix) {
  if (isIP(suffix) === 4) return suffix
  const parts = suffix.split(':')
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null
  }
  const high = Number.parseInt(parts[0], 16)
  const low = Number.parseInt(parts[1], 16)
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
}

function normalizeHostname(value) {
  return value.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
}

function readTimeoutMs() {
  const timeoutMs = Number(process.env.SOURCE_RESEARCH_TIMEOUT_MS ?? 60_000)
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error('SOURCE_RESEARCH_TIMEOUT_MS must be between 1000 and 120000')
  }
  return timeoutMs
}

async function withTimeout(promise, timeoutMs, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
