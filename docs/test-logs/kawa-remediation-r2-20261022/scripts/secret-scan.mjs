// Local secret-scan evidence with the repository's own ruleset and the pinned scanner image.
// 1) the round-1 commit alone, without and with the three pinned entries (CI reproduction)
// 2) every file this round changes or adds, scanned as files
// 3) a synthetic positive control, so a clean result is not vacuous
// usage: node secret-scan.mjs   (needs docker, and a shallow clone of 04317126 at CLONE)
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const IMAGE = 'ghcr.io/gitleaks/gitleaks@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9'
const PREVIOUS = '04317126635a4207a3f9b9ba35ffccf053d16340'
const CLONE = process.env.KAWA_R2_CLONE ?? 'C:/ns-fix/gl-r1'
const outDir = join(evidenceRoot, 'logs', 'secret-scan')
mkdirSync(outDir, { recursive: true })

const sh = (command, cwd = WORKTREE) => spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
const keep = (name, result, command) => {
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((line) => !/^(Author|Email):/.test(line)).join('\n')
  writeFileSync(join(outDir, name), `$ ${command}\nexit=${result.status}\n${text}`)
  console.log(`${name}\texit=${result.status}`)
  return text
}

const version = sh(`docker run --rm ${IMAGE} version`)
keep('scanner-version.log.txt', version, 'gitleaks version')

const stamp = Date.now()
const ignoreDir = `C:/ns-fix/gl-ignore-${stamp}`
mkdirSync(ignoreDir, { recursive: true })
writeFileSync(join(ignoreDir, '.gitleaksignore'), readFileSync(join(WORKTREE, '.gitleaksignore'), 'utf8').replace(/\r/g, ''))

const logOpts = `--no-merges --first-parent ${PREVIOUS}^..${PREVIOUS}`
const base = `docker run --rm -v "${CLONE}:/repo" `
const common = `git /repo --config /repo/config/security/gitleaks.toml --log-opts="${logOpts}" --redact -v --no-banner`
keep('r1-commit-without-pins.log.txt', sh(`${base}${IMAGE} ${common}`), 'gitleaks git (round-1 commit, repository ignore file as it was)')
keep('r1-commit-with-pins.log.txt', sh(`${base}-v "${ignoreDir}:/ign:ro" ${IMAGE} ${common} --gitleaks-ignore-path /ign/.gitleaksignore`), 'gitleaks git (round-1 commit, ignore file of this candidate)')

const names = [
  ...spawnSync(`git diff --name-only ${PREVIOUS}`, { cwd: WORKTREE, shell: true, encoding: 'utf8' }).stdout.split('\n'),
  ...spawnSync('git ls-files --others --exclude-standard', { cwd: WORKTREE, shell: true, encoding: 'utf8' }).stdout.split('\n'),
].map((name) => name.trim()).filter((name) => name.length > 0 && !name.includes('logs/secret-scan/') && !name.endsWith('file-digests.json'))
const scanDir = `C:/ns-fix/gl-scan-${stamp}`
for (const name of new Set(names)) {
  const target = join(scanDir, name)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(WORKTREE, name), target)
}
copyFileSync(join(WORKTREE, 'config/security/gitleaks.toml'), join(scanDir, '..', `gl-config-${stamp}.toml`))
const digestFile = join(WORKTREE, 'docs/test-logs/kawa-remediation-r2-20261022/file-digests.json')
const digestTarget = join(scanDir, 'docs/test-logs/kawa-remediation-r2-20261022/file-digests.json')
mkdirSync(dirname(digestTarget), { recursive: true })
try { copyFileSync(digestFile, digestTarget) } catch { console.log('file-digests.json not present yet') }

const dirScan = `docker run --rm -v "${scanDir}:/scan:ro" -v "C:/ns-fix/gl-config-${stamp}.toml:/cfg/gitleaks.toml:ro" ${IMAGE} dir /scan --config /cfg/gitleaks.toml --redact -v --no-banner`
keep('changed-and-new-files.log.txt', sh(dirScan), `gitleaks dir over ${new Set(names).size} changed or new files plus the digest file`)

const controlDir = `C:/ns-fix/gl-control-${stamp}`
mkdirSync(controlDir, { recursive: true })
const controlValue = randomBytes(20).toString('hex')
writeFileSync(join(controlDir, 'positive-control.txt'), `api_key = "${controlValue}"\n`)
keep('positive-control.log.txt', sh(`docker run --rm -v "${controlDir}:/scan:ro" -v "C:/ns-fix/gl-config-${stamp}.toml:/cfg/gitleaks.toml:ro" ${IMAGE} dir /scan --config /cfg/gitleaks.toml --redact -v --no-banner`), 'gitleaks dir over one synthetic string made for this control (not committed)')
