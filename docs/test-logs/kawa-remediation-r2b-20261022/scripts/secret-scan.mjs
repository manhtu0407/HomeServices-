// Local secret-scan evidence with the repository's own ruleset and the pinned scanner image.
// 1) every file this follow-up changes or adds (against 5f44351e), scanned as files, with the evidence digest file included
// 2) a synthetic positive control, so a clean result is not vacuous
// usage: node secret-scan.mjs   (needs docker)
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const IMAGE = 'ghcr.io/gitleaks/gitleaks@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9'
const PREVIOUS = '5f44351ea8b080a2f0a66d0d61267fab00da68d2'
const outDir = join(evidenceRoot, 'logs', 'secret-scan')
mkdirSync(outDir, { recursive: true })

const sh = (command, cwd = WORKTREE) => spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
const keep = (name, result, command) => {
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((line) => !/^(Author|Email):/.test(line)).join('\n')
  writeFileSync(join(outDir, name), `$ ${command}\nexit=${result.status}\n${text}`)
  console.log(`${name}\texit=${result.status}`)
}

keep('scanner-version.log.txt', sh(`docker run --rm ${IMAGE} version`), 'gitleaks version')

const stamp = Date.now()
const names = [
  ...sh(`git diff --name-only ${PREVIOUS}`).stdout.split('\n'),
  ...sh('git ls-files --others --exclude-standard').stdout.split('\n'),
].map((name) => name.trim()).filter((name) => name.length > 0 && !name.includes('logs/secret-scan/'))
const scanDir = `C:/ns-fix/gl-scan-${stamp}`
for (const name of new Set(names)) {
  const target = join(scanDir, name)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(WORKTREE, name), target)
}
copyFileSync(join(WORKTREE, 'config/security/gitleaks.toml'), join(scanDir, '..', `gl-config-${stamp}.toml`))

const dirScan = `docker run --rm -v "${scanDir}:/scan:ro" -v "C:/ns-fix/gl-config-${stamp}.toml:/cfg/gitleaks.toml:ro" ${IMAGE} dir /scan --config /cfg/gitleaks.toml --redact -v --no-banner`
keep('changed-and-new-files.log.txt', sh(dirScan), `gitleaks dir over ${new Set(names).size} changed or new files, digest file included`)

const controlDir = `C:/ns-fix/gl-control-${stamp}`
mkdirSync(controlDir, { recursive: true })
writeFileSync(join(controlDir, 'positive-control.txt'), `api_key = "${randomBytes(20).toString('hex')}"\n`)
keep('positive-control.log.txt', sh(`docker run --rm -v "${controlDir}:/scan:ro" -v "C:/ns-fix/gl-config-${stamp}.toml:/cfg/gitleaks.toml:ro" ${IMAGE} dir /scan --config /cfg/gitleaks.toml --redact -v --no-banner`), 'gitleaks dir over one synthetic string made for this control (not committed)')
