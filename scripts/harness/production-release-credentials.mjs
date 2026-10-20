import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WINDOWS_STORE_SCRIPT = resolve(ROOT, 'scripts/harness/production-release-credentials.ps1')
const POSIX_STORE_SCRIPT = resolve(ROOT, 'scripts/harness/production-release-credentials.sh')
const SERVICE = 'nestscout-production-release'

export const RELEASE_SECRET_NAMES = Object.freeze([
  'ANTHROPIC_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'DEEPSEEK_API_KEY',
  'EXPO_TOKEN',
  'PERPLEXITY_API_KEY',
  'PRODUCTION_SUPABASE_ANON_KEY',
  'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY',
  'PRODUCTION_SYNTHETIC_CUSTOMER_EMAIL',
  'PRODUCTION_SYNTHETIC_CUSTOMER_PASSWORD',
  'PRODUCTION_SYNTHETIC_WORKER_EMAIL',
  'PRODUCTION_SYNTHETIC_WORKER_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SYSTEM_HEALTH_MONITOR_SECRET',
  'SYSTEM_HEALTH_OBSERVER_SECRET',
  'VIETMAP_API_KEY',
])

export function redactSensitiveText(value, secrets = []) {
  let text = String(value ?? '')
  const normalizedSecrets = [...new Set(secrets.filter((secret) => typeof secret === 'string' && secret.length >= 4))]
    .sort((left, right) => right.length - left.length)
  for (const secret of normalizedSecrets) {
    for (const variant of secretVariants(secret)) text = text.replaceAll(variant, '[REDACTED]')
  }
  return text
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/giu, '$1?[REDACTED_QUERY]')
    .replace(/(\b(?:SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|PRODUCTION_SUPABASE_SERVICE_ROLE_KEY|EXPO_TOKEN|CLOUDFLARE_API_TOKEN|SUPABASE_DB_PASSWORD)\s*[=:]\s*)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(/(\bAuthorization\s*:\s*Bearer\s+)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(/\b(?:sbp_[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{12,})\b/gu, '[REDACTED]')
}

export function secretVariants(secret) {
  const variants = new Set([secret])
  try {
    variants.add(encodeURIComponent(secret))
    variants.add(Buffer.from(secret, 'utf8').toString('base64'))
  } catch {
    return [...variants]
  }
  return [...variants].filter((variant) => variant.length >= 4)
}

export function readReleaseCredentials({ platform = process.platform, names = RELEASE_SECRET_NAMES, root = ROOT } = {}) {
  const requested = [...new Set(names)]
  if (requested.some((name) => !RELEASE_SECRET_NAMES.includes(name))) {
    throw new Error('production release credential name is not allow-listed')
  }
  if (platform === 'win32') return readWindowsCredentials(requested, root)
  if (platform === 'linux') return readSecretServiceCredentials(requested)
  return { values: {}, missing: requested, store: 'unsupported' }
}

export function setReleaseCredential(name, { platform = process.platform, root = ROOT } = {}) {
  if (!RELEASE_SECRET_NAMES.includes(name)) throw new Error('production release credential name is not allow-listed')
  if (platform === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', resolve(root, 'scripts/harness/production-release-credentials.ps1'),
      '-Action', 'Set', '-Name', name,
    ], { cwd: root, stdio: 'inherit' })
    if (result.error || result.status !== 0) throw new Error('secure credential storage failed')
    return `Stored credential: ${name}`
  }
  if (platform === 'linux') {
    const result = spawnSync('bash', [resolve(root, 'scripts/harness/production-release-credentials.sh'), 'set', name], {
      cwd: root, stdio: 'inherit',
    })
    if (result.error || result.status !== 0) throw new Error('secure credential storage failed')
    return `Stored credential: ${name}`
  }
  throw new Error('secure credential storage is supported through Windows Credential Manager or Linux Secret Service')
}

function readWindowsCredentials(names, root) {
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', resolve(root, WINDOWS_STORE_SCRIPT), '-Action', 'Read', '-Names', names.join(','),
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  if (result.error || result.status !== 0) return { values: {}, missing: names, store: 'unavailable' }
  let values
  try { values = JSON.parse(result.stdout) } catch { return { values: {}, missing: names, store: 'unavailable' } }
  const present = Object.fromEntries(names.filter((name) => typeof values[name] === 'string' && values[name].length > 0)
    .map((name) => [name, values[name]]))
  return { values: present, missing: names.filter((name) => !present[name]), store: 'windows-credential-manager' }
}

function readSecretServiceCredentials(names) {
  const values = {}
  for (const name of names) {
    try {
      const value = execFileSync('secret-tool', ['lookup', 'application', SERVICE, 'name', name], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trimEnd()
      if (value.length > 0) values[name] = value
    } catch {
      continue
    }
  }
  return { values, missing: names.filter((name) => !values[name]), store: 'linux-secret-service' }
}

function main() {
  const [command, ...forwarded] = process.argv.slice(2)
  const name = forwarded[0] === '--' ? forwarded[1] : forwarded[0]
  if (command !== 'set' || !name) throw new Error('usage: production-release-credentials.mjs set <allow-listed-name>')
  process.stdout.write(`${setReleaseCredential(name)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`production-release-credentials failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
