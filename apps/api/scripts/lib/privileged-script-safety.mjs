import { randomBytes } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'

const PROJECT_REFS = {
  production: 'iwevizmsedyqozxlawwl',
}
const NON_PRODUCTION_LOCK_MESSAGE = 'Staging and non-production Supabase targets are locked; only Production is available.'

export function assertLiveApproval(name, expectedValue) {
  if (process.env[name] !== expectedValue) {
    throw new Error(`Set ${name}=${expectedValue} to approve this state-changing script`)
  }
}

export function assertSupabaseTargets(environment, supabaseUrl, mobileApiUrl) {
  if (environment !== 'production') throw new Error(NON_PRODUCTION_LOCK_MESSAGE)
  const projectRef = PROJECT_REFS[environment]
  if (!projectRef) throw new Error(`Unsupported Supabase environment: ${environment}`)
  const expectedOrigin = `https://${projectRef}.supabase.co`
  const supabase = parseTrustedUrl(supabaseUrl, environment, expectedOrigin)
  const mobileApi = parseTrustedUrl(mobileApiUrl, environment, expectedOrigin)
  const supabasePath = normalizePath(supabase.pathname)
  const mobileApiPath = normalizePath(mobileApi.pathname)
  if (supabasePath !== '/') {
    throw new Error('Supabase URL must use the project root path')
  }
  if (mobileApiPath !== '/functions/v1/mobile-api') {
    throw new Error('API base URL must use the exact mobile-api path')
  }
}

export function assertSupabaseProjectRef(environment, actualRef) {
  if (environment !== 'production') throw new Error(NON_PRODUCTION_LOCK_MESSAGE)
  const expectedRef = PROJECT_REFS[environment]
  if (!expectedRef || String(actualRef ?? '').trim() !== expectedRef) {
    throw new Error(`Supabase workdir must use the exact ${environment} project ref ${expectedRef ?? ''}`.trim())
  }
}

export function createTimeoutFetch(timeoutMs, options = {}) {
  const boundedTimeout = readBoundedInteger(String(timeoutMs), 'timeoutMs', 1, 300_000)
  const retries = readBoundedInteger(String(options.retries ?? 0), 'retries', 0, 2)
  const retryDelayMs = readBoundedInteger(String(options.retryDelayMs ?? 500), 'retryDelayMs', 0, 5_000)

  return async (input, init = {}) => {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const externalSignal = init.signal
      const abortFromCaller = () => controller.abort(externalSignal?.reason)
      if (externalSignal?.aborted) abortFromCaller()
      else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, boundedTimeout)
      try {
        return await globalThis.fetch(input, {
          ...init,
          redirect: 'error',
          signal: controller.signal,
        })
      } catch (error) {
        if (externalSignal?.aborted) throw error
        lastError = timedOut
          ? new Error(`Privileged request timed out after ${boundedTimeout}ms`)
          : error
        if (attempt === retries) throw lastError
        if (retryDelayMs > 0) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs * (attempt + 1)))
        }
      } finally {
        clearTimeout(timer)
        externalSignal?.removeEventListener('abort', abortFromCaller)
      }
    }
    throw lastError
  }
}

export function createEphemeralPassword(prefix) {
  const safePrefix = String(prefix).replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'NestScout'
  return `${safePrefix}-${randomBytes(24).toString('base64url')}!aA1`
}

export function readBoundedInteger(raw, label, minimum, maximum) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

export function resolveWorkspacePath(repoRoot, candidate, label = 'Path') {
  const root = resolve(repoRoot)
  const target = resolve(root, candidate)
  if (!isInside(root, target) || target === root) {
    throw new Error(`${label} must stay inside the repository workspace`)
  }
  let existingAncestor = target
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor)
    if (parent === existingAncestor) break
    existingAncestor = parent
  }
  const realRoot = realpathSync(root)
  const realAncestor = realpathSync(existingAncestor)
  if (realAncestor !== realRoot && !isInside(realRoot, realAncestor)) {
    throw new Error(`${label} must stay inside the repository workspace`)
  }
  return target
}

export function resolveTrustedSupabaseCli(repoRoot, candidate) {
  const root = resolve(repoRoot)
  const target = resolve(candidate)
  const allowedDirectories = [
    resolve(root, 'apps/api/node_modules/supabase/bin'),
    resolve(root, 'node_modules/supabase/bin'),
  ]
  const executableName = basename(target).toLowerCase()
  const trustedName = executableName === 'supabase' || executableName === 'supabase.exe'
  const trustedDirectory = allowedDirectories.some((directory) => dirname(target) === directory)
  if (!trustedName || !trustedDirectory || !existsSync(target)) {
    throw new Error('P15_SUPABASE_CLI must use the installed repo-local Supabase binary')
  }
  const realTarget = realpathSync(target)
  if (!isInside(root, realTarget)) {
    throw new Error('P15_SUPABASE_CLI must use the installed repo-local Supabase binary')
  }
  return target
}

function parseTrustedUrl(raw, environment, expectedOrigin) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Target must use the exact ${environment} Supabase origin ${expectedOrigin}`)
  }
  if (url.origin !== expectedOrigin || url.username || url.password || url.search || url.hash) {
    throw new Error(`Target must use the exact ${environment} Supabase origin ${expectedOrigin}`)
  }
  return url
}

function normalizePath(pathname) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

function isInside(root, target) {
  const fromRoot = relative(root, target)
  return fromRoot !== '' && fromRoot !== '..' && !fromRoot.startsWith(`..\\`) &&
    !fromRoot.startsWith('../') && !isAbsolute(fromRoot)
}
