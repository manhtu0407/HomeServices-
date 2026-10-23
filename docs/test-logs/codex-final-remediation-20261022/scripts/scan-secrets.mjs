import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const evidence = join(root, 'docs/test-logs/codex-final-remediation-20261022')
const scratch = join(root, '.scratch/codex-final/secret-scan-' + Date.now())
const image = 'ghcr.io/gitleaks/gitleaks@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9'
mkdirSync(scratch, { recursive: true })
const run = (tool, args) => spawnSync(tool, args, { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 })
const names = new Set([
  ...run('git', ['diff', '--name-only', 'origin/main']).stdout.split(/\r?\n/),
  ...run('git', ['ls-files', '--others', '--exclude-standard']).stdout.split(/\r?\n/),
].filter((p) => p && !p.includes('secret-scan') && existsSync(join(root, p))))
for (const path of names) {
  const destination = join(scratch, 'candidate', path)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(join(root, path), destination)
}
const config = join(root, 'config/security/gitleaks.toml')
function scan(name, directory) {
  const r = run('docker', ['run', '--rm', '-v', `${directory}:/scan:ro`, '-v', `${config}:/cfg/gitleaks.toml:ro`, image, 'dir', '/scan', '--config', '/cfg/gitleaks.toml', '--redact', '--no-banner'])
  writeFileSync(join(evidence, `logs/final/secret-scan-${name}.txt`), `exit=${r.status}\n${r.stdout}\n${r.stderr}`)
  return r.status
}
const candidate = scan('candidate', join(scratch, 'candidate'))
mkdirSync(join(scratch, 'positive'), { recursive: true })
writeFileSync(join(scratch, 'positive/fake.txt'), `api_key = "${randomBytes(20).toString('hex')}"\n`)
const positive = scan('positive-control', join(scratch, 'positive'))
console.log(JSON.stringify({ image, scannedFiles: names.size, candidateExit: candidate, positiveControlExit: positive }))
process.exitCode = candidate === 0 && positive === 1 ? 0 : 1
