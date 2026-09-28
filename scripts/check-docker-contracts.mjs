#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const DOCKER_CONTRACT_FILES = [
  '.claude/skills/kael-docker/SKILL.md',
  '.claude/skills/kael-docker/agents/openai.yaml',
  'scripts/run.mjs',
  'docker/scripts/doctor.ps1',
  'docker/scripts/doctor.sh',
  'docker/scripts/ensure-version.ps1',
  'docker/scripts/ensure-version.sh',
  'docker/scripts/up.ps1',
  'docker/scripts/up.sh',
  'docker/scripts/down.ps1',
  'docker/scripts/down.sh',
  'docker/scripts/edge-check.ps1',
  'docker/scripts/edge-check.sh',
  'docker/scripts/gen-types.sh',
  'docker/scripts/run-sql-tests.ps1',
  'docker/scripts/run-sql-tests.sh',
  'docker/profiles/lean.md',
  'docker/profiles/full.md',
  'docker/INDEX.md',
  'package.json',
  '.github/workflows/ci.yml',
  'config/harness/manifest.json',
]

export function ramFloorForProfile(profile) {
  if (profile === 'lean') return 4
  if (profile === 'full') return 7
  throw new Error(`unknown Docker profile: ${profile}`)
}

export function ramPassesProfile(profile, availableGb) {
  return Number.isFinite(availableGb) && availableGb >= ramFloorForProfile(profile)
}

function requireText(problems, files, path, patterns, message) {
  const text = files[path]
  if (typeof text !== 'string') {
    problems.push(`${path}: contract file is missing`)
    return
  }
  if (patterns.some((pattern) => !pattern.test(text))) problems.push(`${path}: ${message}`)
}

function rejectText(problems, files, path, pattern, message) {
  const text = files[path]
  if (typeof text === 'string' && pattern.test(text)) problems.push(`${path}: ${message}`)
}

function parseJson(problems, files, path) {
  try {
    return JSON.parse(files[path])
  } catch (error) {
    problems.push(`${path}: invalid JSON (${error.message})`)
    return null
  }
}

export function dockerContractProblems(files) {
  const problems = []
  const bypass = /SkipDoctor|skip_doctor|--skip-doctor|MinRamGb|min_ram_gb|--min-ram-gb/i

  for (const path of [
    'docker/scripts/doctor.ps1',
    'docker/scripts/doctor.sh',
    'docker/scripts/up.ps1',
    'docker/scripts/up.sh',
    'docker/profiles/lean.md',
    'docker/profiles/full.md',
  ]) {
    rejectText(problems, files, path, bypass, 'doctor or RAM bypass is exposed')
  }

  requireText(
    problems,
    files,
    'scripts/run.mjs',
    [
      /prepareRunnerEnv/,
      /LOCALAPPDATA/,
      /resources['\"]?,?\s*['\"]bin/i,
      /env:\s*prepareRunnerEnv\(\)/,
    ],
    'the shared dispatcher must expose the installed Windows Docker CLI to every runner',
  )
  requireText(
    problems,
    files,
    'docker/scripts/doctor.ps1',
    [/Get-Command\s+docker\.exe/i, /DaemonTimeoutSeconds\s*=\s*15/i, /WaitForExit\([^\n]*DaemonTimeoutSeconds/i, /\$process\.WaitForExit\(\)/i, /Stop-Process\s+-Id/i],
    'the PowerShell doctor must prefer the native Docker executable and clean up a 15-second daemon timeout',
  )
  rejectText(
    problems,
    files,
    'docker/scripts/doctor.ps1',
    /\(\s*Get-Content[^\r\n]*\)\.Trim\(\)/i,
    'redirected daemon output must be null-safe',
  )
  requireText(
    problems,
    files,
    'docker/scripts/doctor.sh',
    [/daemon_timeout_seconds=15/i, /kill_probe_tree[^\n]*TERM/i, /kill_probe_tree[^\n]*KILL/i],
    'the POSIX doctor must enforce and clean up a 15-second daemon timeout',
  )
  for (const path of ['docker/scripts/doctor.ps1', 'docker/scripts/doctor.sh']) {
    rejectText(problems, files, path, /docker system prune/i, 'broad cleanup advice is forbidden')
    rejectText(problems, files, path, /db:local:down/i, 'a port failure cannot assume unverified stack ownership')
    requireText(problems, files, path, [/lean[^\n]*4/i, /full[^\n]*7/i], 'lean/full RAM floors must remain 4 GB and 7 GB')
  }

  requireText(
    problems,
    files,
    'docker/scripts/ensure-version.ps1',
    [
      /UpdateDiagnosticLimit\s*=\s*2048/i,
      /function\s+Bound-Diagnostic/i,
      /\$normalized\.Length\s+-le\s+\$Limit/i,
      /Substring\(\$normalized\.Length\s+-\s+\$tailLength\)/i,
      /UpdateTimeoutSeconds\s*=\s*300/i,
      /desktop[^\n]*update[^\n]*--quiet/i,
      /Bound-Diagnostic\s+-Text\s+\$update\.Stdout/i,
      /Bound-Diagnostic\s+-Text\s+\$update\.Stderr/i,
      /update failed \(exit \$\(\$update\.ExitCode\); stdout=/i,
      /WaitForExit\([^\n]*TimeoutSeconds/i,
      /taskkill|Stop-Process/i,
      /compose[^\n]*pull[^\n]*--help/i,
      /compose[^\n]*run[^\n]*--help/i,
    ],
    'the PowerShell version runner must perform one bounded stable update or prove required Compose capabilities',
  )
  requireText(
    problems,
    files,
    'docker/scripts/ensure-version.sh',
    [
      /diagnostic_limit=2048/i,
      /limit_diagnostic\(\)/i,
      /\$\{#value\}.*-gt\s+"\$limit"/i,
      /value="\[truncated\] \$\{value: -\$tail_limit\}"/i,
      /update_timeout_seconds=300/i,
      /desktop update --quiet/i,
      /limit_diagnostic\s+"\$command_stdout"\s+"\$diagnostic_limit"/i,
      /limit_diagnostic\s+"\$command_stderr"\s+"\$diagnostic_limit"/i,
      /update failed \(exit \$command_code; stdout=/i,
      /kill_command_tree/i,
      /compose pull --help/i,
      /compose run --help/i,
    ],
    'the POSIX version runner must perform one bounded stable update or prove required Compose capabilities',
  )
  for (const path of ['docker/scripts/ensure-version.ps1', 'docker/scripts/ensure-version.sh']) {
    rejectText(problems, files, path, /beta|test channel|preview channel/i, 'prerelease Docker channels are forbidden')
    rejectText(problems, files, path, /for\s+attempt|while\s+true|retrying|updateAttempts\s*=\s*[2-9]/i, 'Docker version updates must not retry')
    requireText(problems, files, path, [/update failed[^\n]*exit/i, /stdout=/i, /stderr=/i], 'updater failures must report the exit code and bounded stdout/stderr diagnostics')
  }

  requireText(problems, files, 'docker/scripts/up.ps1', [/doctor\.ps1/i, /run-supabase\.ps1/i], 'up must run doctor before one Supabase start')
  requireText(problems, files, 'docker/scripts/up.sh', [/doctor\.sh/i, /run-supabase\.sh/i], 'up must run doctor before one Supabase start')

  for (const path of ['docker/scripts/down.ps1', 'docker/scripts/down.sh']) {
    rejectText(problems, files, path, /Purge|--purge|--no-backup/i, 'the agent-facing down runner must be non-destructive')
    requireText(problems, files, path, [/run-supabase/i, /stop/i], 'down must stop through the workspace Supabase runner')
  }

  for (const path of ['docker/scripts/edge-check.ps1', 'docker/scripts/edge-check.sh']) {
    rejectText(problems, files, path, /SKIP\s|pullAttempts|retrying|for\s+attempt|Start-Sleep|sleep\s+\$?\(?.*attempt/i, 'automatic Edge retries or skipped targets are forbidden')
    requireText(
      problems,
      files,
      path,
      [
        /unknown function\(s\)/i,
        /no Edge functions selected/i,
        /missing deno\.json or index\.ts[\s\S]*?exit 2/i,
        /edge check: discovered=/i,
      ],
      'strict Edge selection and an honest discovered/checked/failed summary are required',
    )
  }

  rejectText(problems, files, 'docker/scripts/gen-types.sh', /if\s+!\s+bash\s+[^\n]*run-supabase/i, 'the POSIX type runner must preserve the Supabase exit code')
  requireText(
    problems,
    files,
    'docker/scripts/gen-types.sh',
    [/run-supabase\.sh[^\n]*--local/i, /code=\$\?/i, /trap\s+['"][^\n]*rm -f/i],
    'the POSIX type runner must capture the real exit code and clean its temporary file',
  )

  for (const path of ['docker/scripts/run-sql-tests.ps1', 'docker/scripts/run-sql-tests.sh']) {
    requireText(
      problems,
      files,
      path,
      [
        /no SQL verification files matched/i,
        /discovered=/i,
        /executed=/i,
        /passed=/i,
        /failed=/i,
        /stopped_early=/i,
      ],
      'zero-file refusal and an honest SQL summary are required',
    )
  }

  requireText(
    problems,
    files,
    '.claude/skills/kael-docker/SKILL.md',
    [
      /15 seconds/i,
      /Next Step/i,
      /version update:\s*0\/1/i,
      /RAM recovery:\s*0\/1/i,
      /docker desktop update --quiet/i,
      /latest stable|latest-stable/i,
      /suitable/i,
      /read-only process inventory/i,
      /stale task-owned/i,
      /protects Codex, Claude Code, system\/security/i,
      /Windows launch-origin gate/i,
      /Codex Desktop[\s\S]{0,120}AppContainer[\s\S]{0,120}CodexSandboxUsers/i,
      /WSL\/DrvFS[\s\S]{0,180}must not launch Docker Desktop/i,
      /Windows Start menu or an unsandboxed Windows shell/i,
      /Lane C can close an exact `structure` question as `PASS` and `Task status: DONE`/i,
      /Lane C cannot prove behavior or types/i,
      /When the local-runtime gate is closed, continue independent source\/static work/i,
      /If requested acceptance still needs unavailable Lane A\/B evidence[\s\S]{0,100}no exact Lane D evidence exists/i,
      /Lane A\/B must execute/i,
      /Lane D must prove the[\s\S]{0,60}exact commit SHA/i,
      /An older CI run never proves uncommitted changes/i,
      /Local-runtime state: READY \| BLOCKED \| NOT REQUIRED/i,
      /Runtime evidence: <lane-specific proof, or NOT REQUIRED>/i,
      /Task status:\s*DONE \| BLOCKED/i,
      /Attempt count:/i,
      /Stop reason:/i,
      /PASS \| PARTIAL \| UNVERIFIED/i,
    ],
    'the skill must carry bounded version, safe RAM recovery, lane-aware completion, and closeout contracts',
  )
  rejectText(
    problems,
    files,
    '.claude/skills/kael-docker/SKILL.md',
    /For every task routed through this skill, runtime evidence is mandatory before/i,
    'the skill must use lane-aware completion and must not require runtime evidence for every task regardless of its question',
  )
  requireText(
    problems,
    files,
    'docker/INDEX.md',
    [
      /Codex Desktop[\s\S]{0,120}AppContainer[\s\S]{0,120}CodexSandboxUsers/i,
      /WSL\/DrvFS[\s\S]{0,220}do not launch Docker Desktop/i,
      /Windows Start menu or an unsandboxed Windows shell/i,
      /single final doctor probe/i,
      /Lane C may close an exact structure question/i,
      /When local runtime is closed, source\/static work can continue independently/i,
    ],
    'the Docker map must document the sandboxed Windows launch boundary',
  )
  requireText(
    problems,
    files,
    '.claude/skills/kael-docker/agents/openai.yaml',
    [/Route/i, /database/i, /Edge/i, /version/i, /lane-specific evidence/i],
    'the descriptor must advertise question-first routing, version selection, and lane-specific evidence',
  )

  const pkg = parseJson(problems, files, 'package.json')
  if (pkg) {
    if (!/db reset --local(?:\s|$)/.test(pkg.scripts?.['db:local:reset'] ?? '')) {
      problems.push('package.json: db:local:reset must spell out --local')
    }
    if (!/check-docker-contracts\.mjs/.test(pkg.scripts?.['docker:contracts'] ?? '')) {
      problems.push('package.json: docker:contracts must run the Docker contract ratchet')
    }
    if (!/docker\/scripts\/ensure-version/.test(pkg.scripts?.['docker:version:ensure'] ?? '')) {
      problems.push('package.json: docker:version:ensure must dispatch the bounded version runner')
    }
  }

  requireText(
    problems,
    files,
    '.github/workflows/ci.yml',
    [/Docker contract ratchet/i, /node scripts\/check-docker-contracts\.mjs/i],
    'the Docker contract ratchet must run in CI',
  )

  const manifest = parseJson(problems, files, 'config/harness/manifest.json')
  if (manifest) {
    const entry = manifest.entries?.find((candidate) => candidate.id === 'kael-docker')
    if (!entry) {
      problems.push('config/harness/manifest.json: kael-docker entry is missing')
    } else {
      if (Object.hasOwn(entry, 'runtimeDependencies')) {
        problems.push('config/harness/manifest.json: lane-dependent Docker requirements cannot be universal runtimeDependencies')
      }
      const environments = new Set(entry.allowedEnvironments ?? [])
      for (const environment of ['local', 'preview', 'staging', 'production']) {
        if (!environments.has(environment)) problems.push(`config/harness/manifest.json: kael-docker is missing ${environment} from allowedEnvironments`)
      }
      if (!/(route|evidence)/i.test(entry.purpose ?? '') || !/version/i.test(entry.purpose ?? '') || !/Docker Desktop stable/i.test(entry.purpose ?? '') || !/lane-specific evidence/i.test(entry.purpose ?? '')) {
        problems.push('config/harness/manifest.json: kael-docker purpose must describe Docker Desktop stable version selection and lane-specific evidence')
      }
      if (!/lane-specific evidence/i.test(entry.trigger ?? '') || !/Lane C/i.test(entry.trigger ?? '')) {
        problems.push('config/harness/manifest.json: kael-docker trigger must route to lane-specific evidence, including Lane C')
      }
    }
  }

  return problems
}

export function readDockerContractFiles(root = ROOT) {
  return Object.fromEntries(DOCKER_CONTRACT_FILES.map((path) => {
    try {
      return [path, readFileSync(resolve(root, path), 'utf8')]
    } catch (error) {
      if (error.code === 'ENOENT') return [path, undefined]
      throw error
    }
  }))
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const problems = dockerContractProblems(readDockerContractFiles())
  if (problems.length) {
    console.error('Docker contract violations:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(`Docker contracts ok: ${DOCKER_CONTRACT_FILES.length} files checked`)
}
