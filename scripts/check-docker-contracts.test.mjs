import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  dockerContractProblems,
  ramFloorForProfile,
  ramPassesProfile,
  readDockerContractFiles,
} from './check-docker-contracts.mjs'
import { prepareRunnerEnv } from './run.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function runRunner(args, options = {}) {
  return spawnSync(process.execPath, ['scripts/run.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeout ?? 10_000,
    env: options.env ?? process.env,
  })
}

test('Windows runner discovers per-user Docker CLI without hiding an existing PATH entry', () => {
  const env = {
    Path: 'C:\\fake-docker',
    LOCALAPPDATA: 'C:\\Users\\Tu\\AppData\\Local',
    ProgramFiles: 'C:\\Program Files',
  }
  const prepared = prepareRunnerEnv(env, 'win32', (candidate) => candidate.endsWith('resources\\bin'))
  const entries = prepared.Path.split(';')

  assert.equal(entries[0], 'C:\\fake-docker')
  assert.ok(entries.includes('C:\\Users\\Tu\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin'))
  assert.ok(entries.includes('C:\\Program Files\\Docker\\Docker\\resources\\bin'))
})

function writeWindowsDockerExecutableShim(directory) {
  const windowsRoot = process.env.WINDIR ?? 'C:\\Windows'
  const compilers = [
    join(windowsRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(windowsRoot, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  const compiler = compilers.find((candidate) => existsSync(candidate))
  if (!compiler) throw new Error('Windows Docker fixture requires the .NET Framework C# compiler')

  const source = join(directory, 'docker-shim.cs')
  const executable = join(directory, 'docker.exe')
  writeFileSync(source, String.raw`using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

public static class DockerShim
{
    public static int Main(string[] args)
    {
        string log = Environment.GetEnvironmentVariable("NESTSCOUT_FAKE_DOCKER_LOG");
        if (!String.IsNullOrEmpty(log))
            File.AppendAllText(log, String.Join(" ", args) + Environment.NewLine);

        string mode = Environment.GetEnvironmentVariable("NESTSCOUT_FAKE_DOCKER_MODE");
        if (mode == "doctor-pass" && args.Length > 0 && args[0] == "info")
        {
            Console.WriteLine("29.7.2");
            return 0;
        }
        if (mode == "hang")
        {
            string pidFile = Environment.GetEnvironmentVariable("NESTSCOUT_FAKE_DOCKER_PID");
            File.WriteAllText(pidFile, Process.GetCurrentProcess().Id.ToString());
            Thread.Sleep(60000);
            return 0;
        }
        return 9;
    }
}
`)
  const compiled = spawnSync(compiler, ['/nologo', '/target:exe', `/out:${executable}`, source], {
    encoding: 'utf8',
  })
  if (compiled.status !== 0) {
    throw new Error(`could not compile Windows Docker fixture: ${combinedOutput(compiled)}`)
  }
  rmSync(source, { force: true })
}

function fakeDocker(mode) {
  const directory = mkdtempSync(join(tmpdir(), 'nestscout-fake-docker-'))
  const log = join(directory, 'calls.log')
  const pidFile = join(directory, 'pid.txt')
  const path = join(directory, process.platform === 'win32' ? 'docker.cmd' : 'docker')

  if (process.platform === 'win32') {
    writeFileSync(path, [
      '@echo off',
      'echo %*>>"%NESTSCOUT_FAKE_DOCKER_LOG%"',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-pass" if "%1"=="--version" goto version_pass_docker',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-pass" if "%1 %2"=="compose version" goto version_pass_compose',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-pass" if "%1 %2 %3"=="desktop update --help" goto version_desktop_help',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-pass" if "%1 %2 %3"=="desktop update --quiet" goto version_desktop_current',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-pass" if "%1 %2 %3"=="compose pull --help" goto version_pull_help',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-pass" if "%1 %2 %3"=="compose run --help" goto version_run_help',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-suitable" if "%1"=="--version" goto version_suitable_docker',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-suitable" if "%1 %2"=="compose version" goto version_suitable_compose',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-suitable" if "%1 %2 %3"=="desktop update --help" goto version_desktop_unavailable',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-suitable" if "%1 %2 %3"=="compose pull --help" goto version_pull_help',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-suitable" if "%1 %2 %3"=="compose run --help" goto version_run_help',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-fail" if "%1"=="--version" goto version_suitable_docker',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-fail" if "%1 %2"=="compose version" goto version_suitable_compose',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-fail" if "%1 %2 %3"=="desktop update --help" goto version_desktop_help',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="version-fail" if "%1 %2 %3"=="desktop update --quiet" goto version_desktop_failure',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="doctor-pass" if "%1"=="info" (echo 29.7.2& exit /b 0)',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="hang" powershell -NoProfile -Command "$PID | Set-Content -LiteralPath $env:NESTSCOUT_FAKE_DOCKER_PID; Start-Sleep -Seconds 60"',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="sql" if "%1"=="ps" (echo supabase_db_nestscout& exit /b 0)',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="sql" (echo simulated sql failure 1>&2& exit /b 7)',
      'if "%NESTSCOUT_FAKE_DOCKER_MODE%"=="edge-pass" exit /b 0',
      'exit /b 9',
      ':version_pass_docker',
      'echo Docker version 29.7.2',
      'exit /b 0',
      ':version_suitable_docker',
      'echo Docker version 28.5.1',
      'exit /b 0',
      ':version_pass_compose',
      'echo Docker Compose version v2.40.0',
      'exit /b 0',
      ':version_suitable_compose',
      'echo Docker Compose version v2.39.4',
      'exit /b 0',
      ':version_desktop_help',
      'echo Usage: docker desktop update [OPTIONS]',
      'exit /b 0',
      ':version_desktop_current',
      'echo Docker Desktop is current',
      'exit /b 0',
      ':version_desktop_unavailable',
      'echo desktop updater unavailable 1>&2',
      'exit /b 9',
      ':version_desktop_failure',
      'echo simulated update failure 1>&2',
      'exit /b 9',
      ':version_pull_help',
      'echo Options: --policy string',
      'exit /b 0',
      ':version_run_help',
      'echo Options: --pull string',
      'exit /b 0',
      '',
    ].join('\r\n'))
    if (mode === 'fail' || mode === 'doctor-pass' || mode === 'hang') {
      writeWindowsDockerExecutableShim(directory)
    }
  } else {
    writeFileSync(path, [
      '#!/bin/sh',
      'printf "%s\\n" "$*" >> "$NESTSCOUT_FAKE_DOCKER_LOG"',
      'case "$NESTSCOUT_FAKE_DOCKER_MODE:$*" in',
      '  version-pass:--version) echo "Docker version 29.7.2"; exit 0 ;;',
      '  version-suitable:--version|version-fail:--version) echo "Docker version 28.5.1"; exit 0 ;;',
      '  version-pass:compose\\ version) echo "Docker Compose version v2.40.0"; exit 0 ;;',
      '  version-suitable:compose\\ version|version-fail:compose\\ version) echo "Docker Compose version v2.39.4"; exit 0 ;;',
      '  version-suitable:desktop\\ update\\ --help) echo "desktop updater unavailable" >&2; exit 9 ;;',
      '  version-pass:desktop\\ update\\ --help|version-fail:desktop\\ update\\ --help) echo "Usage: docker desktop update [OPTIONS]"; exit 0 ;;',
      '  version-pass:desktop\\ update\\ --quiet) echo "Docker Desktop is current"; exit 0 ;;',
      '  version-fail:desktop\\ update\\ --quiet) echo "simulated update failure" >&2; exit 9 ;;',
      '  version-pass:compose\\ pull\\ --help|version-suitable:compose\\ pull\\ --help) echo "Options: --policy string"; exit 0 ;;',
      '  version-pass:compose\\ run\\ --help|version-suitable:compose\\ run\\ --help) echo "Options: --pull string"; exit 0 ;;',
      'esac',
      'if [ "$NESTSCOUT_FAKE_DOCKER_MODE" = hang ]; then',
      '  echo $$ > "$NESTSCOUT_FAKE_DOCKER_PID"',
      '  sleep 60 & child=$!',
      "  trap 'kill \"$child\" 2>/dev/null; exit 143' TERM INT",
      '  wait "$child"',
      'fi',
      'if [ "$NESTSCOUT_FAKE_DOCKER_MODE" = sql ] && [ "$1" = ps ]; then echo supabase_db_nestscout; exit 0; fi',
      'if [ "$NESTSCOUT_FAKE_DOCKER_MODE" = sql ]; then echo simulated sql failure >&2; exit 7; fi',
      'if [ "$NESTSCOUT_FAKE_DOCKER_MODE" = edge-pass ]; then exit 0; fi',
      'exit 9',
      '',
    ].join('\n'))
    chmodSync(path, 0o755)
  }

  const env = { ...process.env }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
    ?? (process.platform === 'win32' ? 'Path' : 'PATH')
  env[pathKey] = `${directory}${delimiter}${env[pathKey] ?? ''}`
  Object.assign(env, {
    LOCALAPPDATA: join(directory, 'missing-local-app-data'),
    ProgramFiles: join(directory, 'missing-program-files'),
    ProgramW6432: join(directory, 'missing-program-files'),
    NESTSCOUT_FAKE_DOCKER_LOG: log,
    NESTSCOUT_FAKE_DOCKER_MODE: mode,
    NESTSCOUT_FAKE_DOCKER_PID: pidFile,
  })

  return {
    directory,
    log,
    pidFile,
    env,
  }
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function bashExecutable() {
  if (process.platform !== 'win32') return 'bash'
  return join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
}

function toGitBashPath(path) {
  if (process.platform !== 'win32') return path
  return path.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll('\\', '/')
}

function goodFiles() {
  return {
    '.claude/skills/kael-docker/SKILL.md': [
      '15 seconds',
      'A plain “Next Step” does not reopen a closed lane.',
      'version update: 0/1',
      'RAM recovery: 0/1',
      'docker desktop update --quiet',
      'latest stable',
      'suitable',
      'read-only process inventory',
      'stale task-owned helper',
      'protects Codex, Claude Code, system/security',
      'Windows launch-origin gate',
      'Codex Desktop AppContainer CodexSandboxUsers',
      'WSL/DrvFS mismatch means the skill must not launch Docker Desktop',
      'Windows Start menu or an unsandboxed Windows shell',
      'runtime evidence is mandatory before Task status: DONE',
      'Lane A or B executes the current checkout',
      'Lane D supplies the exact commit SHA, workflow URL, job URL',
      'uncommitted changes cannot prove an older commit',
      'Runtime evidence:',
      'Task status: DONE | BLOCKED',
      'Attempt count:',
      'Stop reason:',
      'Result: PASS | PARTIAL | UNVERIFIED',
    ].join('\n'),
    '.claude/skills/kael-docker/agents/openai.yaml': 'short_description: "Route database and Edge verification with version and runtime gates"',
    'scripts/run.mjs': [
      'prepareRunnerEnv',
      'LOCALAPPDATA',
      "'resources', 'bin'",
      'env: prepareRunnerEnv()',
    ].join('\n'),
    'docker/scripts/doctor.ps1': [
      '$docker = @(Get-Command docker.exe -CommandType Application)',
      '$DaemonTimeoutSeconds = 15',
      '$process.WaitForExit($DaemonTimeoutSeconds * 1000)',
      '$process.WaitForExit()',
      'Stop-Process -Id $process.Id',
      '$RamFloors = @{ lean = 4; full = 7 }',
    ].join('\n'),
    'docker/scripts/doctor.sh': [
      'daemon_timeout_seconds=15',
      'kill_probe_tree "$probe_pid" TERM',
      'kill_probe_tree "$probe_pid" KILL',
      'lean) required_ram_gb=4',
      'full) required_ram_gb=7',
    ].join('\n'),
    'docker/scripts/ensure-version.ps1': [
      '$UpdateTimeoutSeconds = 300',
      "$update = Invoke-DockerCommand -Arguments @('desktop', 'update', '--quiet') -TimeoutSeconds $UpdateTimeoutSeconds",
      '$process.WaitForExit($UpdateTimeoutSeconds * 1000)',
      'taskkill /PID $process.Id /T /F',
      "@('compose', 'pull', '--help')",
      "@('compose', 'run', '--help')",
    ].join('\n'),
    'docker/scripts/ensure-version.sh': [
      'update_timeout_seconds=300',
      'docker desktop update --quiet',
      'kill_command_tree "$command_pid" TERM',
      'docker compose pull --help',
      'docker compose run --help',
    ].join('\n'),
    'docker/scripts/up.ps1': 'doctor.ps1 -Profile $Profile\nscripts\\run-supabase.ps1 start',
    'docker/scripts/up.sh': 'doctor.sh --profile "$profile"\nscripts/run-supabase.sh start',
    'docker/scripts/down.ps1': 'scripts\\run-supabase.ps1 stop',
    'docker/scripts/down.sh': 'scripts/run-supabase.sh stop',
    'docker/scripts/edge-check.ps1': [
      'unknown function(s)',
      'no Edge functions selected',
      'missing deno.json or index.ts',
      'exit 2',
      'edge check: discovered=',
    ].join('\n'),
    'docker/scripts/edge-check.sh': [
      'unknown function(s)',
      'no Edge functions selected',
      'missing deno.json or index.ts',
      'exit 2',
      'edge check: discovered=',
    ].join('\n'),
    'docker/scripts/gen-types.sh': [
      'bash "$repo_root/scripts/run-supabase.sh" gen types typescript --local > "$temp"',
      'code=$?',
      "trap 'rm -f \"$temp\"' EXIT",
    ].join('\n'),
    'docker/scripts/run-sql-tests.ps1': [
      'no SQL verification files matched',
      'discovered=$discovered executed=$executed passed=$passed failed=$failed stopped_early=$stoppedEarly',
    ].join('\n'),
    'docker/scripts/run-sql-tests.sh': [
      'no SQL verification files matched',
      'discovered=$discovered executed=$executed passed=$passed failed=$failed stopped_early=$stopped_early',
    ].join('\n'),
    'docker/profiles/lean.md': 'The lean profile requires 4 GB available RAM.',
    'docker/profiles/full.md': 'The full profile requires 7 GB available RAM.',
    'docker/INDEX.md': [
      'Codex Desktop AppContainer CodexSandboxUsers',
      'WSL/DrvFS mismatch means do not launch Docker Desktop',
      'Windows Start menu or an unsandboxed Windows shell',
      'single final doctor probe',
    ].join('\n'),
    'package.json': JSON.stringify({
      scripts: {
        'db:local:reset': 'node scripts/run.mjs run-supabase db reset --local',
        'docker:contracts': 'node scripts/run.mjs run-node scripts/check-docker-contracts.mjs',
        'docker:version:ensure': 'node scripts/run.mjs docker/scripts/ensure-version',
      },
    }),
    '.github/workflows/harness-assurance.yml': '- name: Docker contract ratchet\n  run: node scripts/check-docker-contracts.mjs',
    'config/harness/manifest.json': JSON.stringify({
      entries: [{
        id: 'kael-docker',
        purpose: 'Route database and Edge verification through evidence, bounded version selection, and required runtime completion.',
        allowedEnvironments: ['local', 'preview', 'staging', 'production'],
      }],
    }),
  }
}

test('the accepted Docker contract has no violations', () => {
  assert.deepEqual(dockerContractProblems(goodFiles()), [])
})

test('RAM floors are immutable at the boundary', () => {
  assert.equal(ramFloorForProfile('lean'), 4)
  assert.equal(ramFloorForProfile('full'), 7)
  assert.equal(ramPassesProfile('lean', 3.99), false)
  assert.equal(ramPassesProfile('lean', 4), true)
  assert.equal(ramPassesProfile('full', 6.99), false)
  assert.equal(ramPassesProfile('full', 7), true)
  assert.throws(() => ramFloorForProfile('unknown'), /unknown Docker profile/)
})

test('doctor and up bypasses are rejected by the contract', () => {
  const files = goodFiles()
  files['docker/scripts/up.ps1'] += '\n[switch]$SkipDoctor\n[double]$MinRamGb = 2'
  files['docker/scripts/up.sh'] += '\n--skip-doctor\n--min-ram-gb 2'
  const report = dockerContractProblems(files).join('\n')
  assert.match(report, /bypass/i)
})

test('unbounded daemon probes and unsafe cleanup advice are rejected', () => {
  const files = goodFiles()
  files['docker/scripts/doctor.ps1'] = 'docker info\ndocker system prune\npnpm db:local:down'
  files['docker/scripts/doctor.sh'] = 'docker info\ndocker system prune\npnpm db:local:down'
  const report = dockerContractProblems(files).join('\n')
  assert.match(report, /15-second daemon timeout/i)
  assert.match(report, /broad cleanup/i)
  assert.match(report, /unverified stack ownership/i)
})

test('unsafe trimming of empty redirected daemon output is rejected', () => {
  const files = goodFiles()
  files['docker/scripts/doctor.ps1'] += '\n$stdout = (Get-Content -Raw $stdoutPath).Trim()'
  assert.match(dockerContractProblems(files).join('\n'), /null-safe/i)
})

test('the Windows doctor must prefer the native Docker executable', () => {
  const files = goodFiles()
  files['docker/scripts/doctor.ps1'] = files['docker/scripts/doctor.ps1'].replace('Get-Command docker.exe', 'Get-Command docker')
  assert.match(dockerContractProblems(files).join('\n'), /native Docker executable/i)
})

test('false-success output shapes are rejected', () => {
  const files = goodFiles()
  files['docker/scripts/edge-check.sh'] = 'SKIP function\nedge check passed: 0 function(s)'
  files['docker/scripts/run-sql-tests.ps1'] = 'sql verification: 0 passed / 0 failed / 0 total'
  files['docker/scripts/gen-types.sh'] = 'if ! bash runner; then code=$?; exit "$code"; fi'
  const report = dockerContractProblems(files).join('\n')
  assert.match(report, /strict Edge selection/i)
  assert.match(report, /honest SQL summary/i)
  assert.match(report, /exit code/i)
})

test('missing Edge configuration is invalid selection, never an environment retry', () => {
  const files = goodFiles()
  files['docker/scripts/edge-check.ps1'] = files['docker/scripts/edge-check.ps1'].replace('exit 2', 'exit 1')
  files['docker/scripts/edge-check.sh'] = files['docker/scripts/edge-check.sh'].replace('exit 2', 'exit 1')
  assert.match(dockerContractProblems(files).join('\n'), /strict Edge selection/i)
})

test('version retry loops and runtime-free completion are rejected', () => {
  const files = goodFiles()
  files['docker/scripts/ensure-version.sh'] += '\nfor attempt in 1 2; do docker desktop update --quiet; done'
  files['.claude/skills/kael-docker/SKILL.md'] = files['.claude/skills/kael-docker/SKILL.md'].replace('Runtime evidence:', 'Static evidence:')
  const report = dockerContractProblems(files).join('\n')
  assert.match(report, /must not retry/i)
  assert.match(report, /runtime completion/i)
})

test('sandboxed Windows GUI launch workarounds are rejected', () => {
  const files = goodFiles()
  files['.claude/skills/kael-docker/SKILL.md'] = files['.claude/skills/kael-docker/SKILL.md']
    .replace('WSL/DrvFS mismatch means the skill must not launch Docker Desktop', 'launch Docker again')
  files['docker/INDEX.md'] = files['docker/INDEX.md']
    .replace('WSL/DrvFS mismatch means do not launch Docker Desktop', 'launch through an agent broker')
  const report = dockerContractProblems(files).join('\n')
  assert.match(report, /closeout contracts/i)
  assert.match(report, /sandboxed Windows launch boundary/i)
})

test('the current repository satisfies the Docker contract', () => {
  assert.deepEqual(dockerContractProblems(readDockerContractFiles()), [])
})

test('invalid invocations exit 2 before Docker can run', () => {
  const cases = [
    ['docker/scripts/doctor', '--profile', 'invalid'],
    ['docker/scripts/ensure-version', '--wat'],
    ['docker/scripts/up', '--skip-doctor'],
    ['docker/scripts/up', '--min-ram-gb', '2'],
    ['docker/scripts/down', '--purge'],
    ['docker/scripts/edge-check', '--only', 'not-a-function'],
    ['docker/scripts/gen-types', '--wat'],
    ['docker/scripts/run-sql-tests', '--wat'],
    ['docker/scripts/run-sql-tests', '--filter', '__no_such_sql_file__.sql'],
  ]

  for (const args of cases) {
    const result = runRunner(args)
    assert.equal(result.status, 2, `${args.join(' ')}\n${combinedOutput(result)}`)
  }
})

test('Desktop stable update is attempted exactly once before capability proof', () => {
  const fake = fakeDocker('version-pass')
  try {
    const result = runRunner(['docker/scripts/ensure-version'], { env: fake.env })
    assert.equal(result.status, 0, combinedOutput(result))
    assert.match(combinedOutput(result), /strategy=latest-stable/i)
    assert.match(combinedOutput(result), /update_attempts=1/i)
    const calls = readFileSync(fake.log, 'utf8').trim().split(/\r?\n/)
    assert.equal(calls.filter((call) => call === 'desktop update --quiet').length, 1)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('an install without Desktop updater is accepted only when Compose is suitable', () => {
  const fake = fakeDocker('version-suitable')
  try {
    const result = runRunner(['docker/scripts/ensure-version'], { env: fake.env })
    assert.equal(result.status, 0, combinedOutput(result))
    assert.match(combinedOutput(result), /strategy=compatible/i)
    assert.match(combinedOutput(result), /update_attempts=0/i)
    const calls = readFileSync(fake.log, 'utf8').trim().split(/\r?\n/)
    assert.equal(calls.filter((call) => call === 'desktop update --quiet').length, 0)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('a failed Desktop update fails closed after one attempt', () => {
  const fake = fakeDocker('version-fail')
  try {
    const result = runRunner(['docker/scripts/ensure-version'], { env: fake.env })
    assert.equal(result.status, 1, combinedOutput(result))
    assert.match(combinedOutput(result), /update_attempts=1/i)
    assert.match(combinedOutput(result), /no automatic retry/i)
    const calls = readFileSync(fake.log, 'utf8').trim().split(/\r?\n/)
    assert.equal(calls.filter((call) => call === 'desktop update --quiet').length, 1)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('all six canonical Edge targets are checked exactly once', () => {
  const fake = fakeDocker('edge-pass')
  try {
    const result = runRunner(['docker/scripts/edge-check'], { env: fake.env })
    assert.equal(result.status, 0, combinedOutput(result))
    assert.match(combinedOutput(result), /discovered=6 selected=6 checked=6 failed=0/)
    assert.equal(readFileSync(fake.log, 'utf8').trim().split(/\r?\n/).length, 7)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('gen-types.sh preserves the Supabase exit code and removes its temporary file', (context) => {
  const bash = bashExecutable()
  if (process.platform === 'win32' && !existsSync(bash)) {
    context.skip('Git Bash is unavailable on this Windows host')
    return
  }

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'nestscout-gen-types-'))
  try {
    const dockerScripts = join(fixtureRoot, 'docker', 'scripts')
    const scripts = join(fixtureRoot, 'scripts')
    const temp = join(fixtureRoot, 'temp')
    mkdirSync(dockerScripts, { recursive: true })
    mkdirSync(scripts, { recursive: true })
    mkdirSync(temp, { recursive: true })

    const runner = join(dockerScripts, 'gen-types.sh')
    const fakeSupabase = join(scripts, 'run-supabase.sh')
    writeFileSync(runner, readFileSync(join(ROOT, 'docker', 'scripts', 'gen-types.sh')))
    writeFileSync(fakeSupabase, '#!/usr/bin/env bash\nexit 37\n')
    chmodSync(runner, 0o755)
    chmodSync(fakeSupabase, 0o755)

    const result = spawnSync(bash, ['docker/scripts/gen-types.sh'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: toGitBashPath(temp) },
    })
    assert.equal(result.status, 37, combinedOutput(result))
    assert.match(combinedOutput(result), /failed with exit code 37/i)
    assert.deepEqual(readdirSync(temp), [])
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('an Edge registry failure is attempted once and reported without false success', () => {
  const fake = fakeDocker('fail')
  try {
    const result = runRunner(['docker/scripts/edge-check', '--only', 'mobile-api'], { env: fake.env })
    assert.equal(result.status, 1, combinedOutput(result))
    assert.match(combinedOutput(result), /no automatic retry/i)
    assert.match(combinedOutput(result), /checked=0 failed=0/)
    assert.equal(readFileSync(fake.log, 'utf8').trim().split(/\r?\n/).length, 1)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('SQL stop-on-first reports discovered and executed separately', () => {
  const fake = fakeDocker('sql')
  try {
    const result = runRunner([
      'docker/scripts/run-sql-tests',
      '--filter',
      '*verification.sql',
      '--stop-on-first-failure',
    ], { env: fake.env })
    assert.equal(result.status, 1, combinedOutput(result))
    assert.match(combinedOutput(result), /discovered=\d+ executed=1 passed=0 failed=1 stopped_early=true/)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('a failing Windows daemon shim preserves its numeric exit state', (context) => {
  if (process.platform !== 'win32') {
    context.skip('PowerShell redirected-file behavior is Windows-specific')
    return
  }

  const fake = fakeDocker('fail')
  try {
    const result = runRunner(['docker/scripts/doctor'], { env: fake.env })
    const output = combinedOutput(result)
    assert.equal(result.status, 1, output)
    assert.match(output, /unreachable \(exit 9\)/i)
    assert.doesNotMatch(output, /null-valued expression/i)
    assert.doesNotMatch(output, /docker daemon\s+probe failed:/i)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('a successful Windows daemon shim reports the daemon reachable', (context) => {
  if (process.platform !== 'win32') {
    context.skip('PowerShell command-shim behavior is Windows-specific')
    return
  }

  const fake = fakeDocker('doctor-pass')
  try {
    const result = runRunner(['docker/scripts/doctor'], { env: fake.env })
    const output = combinedOutput(result)
    assert.match(output, /docker daemon\s+reachable \(server 29\.7\.2\)\s+OK/i)
    assert.doesNotMatch(output, /Docker daemon probe failed/i)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})

test('a hanging daemon probe is killed at the fixed timeout', { timeout: 25_000 }, () => {
  const fake = fakeDocker('hang')
  try {
    const started = Date.now()
    const result = runRunner(['docker/scripts/doctor'], { env: fake.env, timeout: 23_000 })
    const elapsed = Date.now() - started
    assert.equal(result.status, 1, combinedOutput(result))
    assert.match(combinedOutput(result), /timeout after 15 seconds/i)
    assert.ok(elapsed >= 14_000 && elapsed < 21_000, `daemon timeout took ${elapsed}ms`)

    const pid = Number.parseInt(readFileSync(fake.pidFile, 'utf8').trim(), 10)
    assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i)
  } finally {
    rmSync(fake.directory, { recursive: true, force: true })
  }
})
