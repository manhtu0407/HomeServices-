import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs'])
const CREATE_CLIENT = /\bcreateClient\s*\(/u
const SUPABASE_IMPORT = /@supabase\/supabase-js/u

const repoPath = (value) => value.split(sep).join('/')

export function checkPrivilegedClientBoundaries(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const allowlistPath = resolve(root, options.allowlistPath ?? 'config/harness/privileged-client-allowlist.json')
  if (!existsSync(allowlistPath)) {
    return { ok: false, problems: ['missing privileged client allowlist'] }
  }
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'))
  const approved = new Set(allowlist.approvedFactories.map((entry) => entry.path))
  const problems = []
  for (const entry of allowlist.approvedFactories) {
    if (!entry.reason?.trim()) problems.push(`approved factory ${entry.path} is missing a reason`)
    if (!existsSync(resolve(root, entry.path))) problems.push(`approved factory does not exist: ${entry.path}`)
  }

  for (const path of discoverSources(resolve(root, 'supabase/functions'))) {
    const relativePath = repoPath(relative(root, path))
    const source = readFileSync(path, 'utf8')
    if (!SUPABASE_IMPORT.test(source) && !CREATE_CLIENT.test(source)) continue
    if (!approved.has(relativePath)) {
      problems.push(`unapproved privileged client factory: ${relativePath}`)
    }
  }

  const mobileAuth = readFileSync(
    resolve(root, 'supabase/functions/mobile-api/_shared/platform/auth.ts'),
    'utf8',
  )
  if (mobileAuth.includes('@supabase/supabase-js') || CREATE_CLIENT.test(mobileAuth)) {
    problems.push('mobile-api auth must use the privileged client adapter')
  }

  return { ok: problems.length === 0, problems }
}

function discoverSources(start) {
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path)
    }
  }
  walk(start)
  return files.sort()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = checkPrivilegedClientBoundaries()
  if (report.ok) console.log('privileged Supabase client boundary ok')
  else {
    console.error('privileged Supabase client boundary violations:')
    for (const problem of report.problems) console.error(`  - ${problem}`)
    process.exitCode = 1
  }
}
