import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function validateInstance(instance) {
  if (typeof instance !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/u.test(instance) ||
      ['production', 'staging', 'main', 'default', 'nestscout'].includes(instance)) {
    throw new Error('invalid QA local instance')
  }
}

function dockerOutput(run, args) {
  const result = run('docker', args, { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  if (result.error || result.status !== 0) throw new Error('QA network command failed')
  return result.stdout.trim()
}

export function ensureLocalQaNetwork(instance, run = spawnSync) {
  validateInstance(instance)
  const name = `nestscout-qa-fixture-${instance}`
  const invoke = (args) => dockerOutput(run, args)
  const existing = invoke(['network', 'ls', '--filter', `name=^${name}$`, '--format', '{{.Name}}'])
  if (existing && existing !== name) throw new Error('QA network identity mismatch')
  if (!existing) invoke(['network', 'create', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', '--label', `nestscout.qa.instance=${instance}`, name])
  let identity
  try {
    identity = JSON.parse(invoke(['network', 'inspect', name, '--format', '{{json .}}']))
  } catch {
    throw new Error('QA network identity unavailable')
  }
  if (identity?.Internal !== false || identity.Driver !== 'bridge' || identity.Scope !== 'local' ||
      identity.Labels?.['nestscout.qa.instance'] !== instance ||
      identity.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') {
    throw new Error('QA network identity mismatch')
  }
  return name
}

export function assertLocalQaBindings(instance, run = spawnSync) {
  validateInstance(instance)
  const project = `nestscout-qa-${instance}`
  const required = [`supabase_db_${project}`, `supabase_kong_${project}`]
  const names = dockerOutput(run, ['ps', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.Names}}']).split(/\r?\n/u).filter(Boolean)
  if (required.some((name) => !names.includes(name)) || names.some((name) => !name.startsWith('supabase_') || !name.endsWith(`_${project}`))) {
    throw new Error('QA project identity is incomplete')
  }
  let bindings = 0
  for (const name of names) {
    const ports = JSON.parse(dockerOutput(run, ['inspect', name, '--format', '{{json .NetworkSettings.Ports}}']))
    const published = Object.values(ports ?? {}).flatMap((entries) => entries ?? [])
    if (required.includes(name) && published.length === 0) throw new Error('QA port binding is missing')
    for (const port of published) {
      if (!['127.0.0.1', '::1'].includes(port.HostIp)) throw new Error('QA port binding is not loopback')
      bindings += 1
    }
  }
  return bindings
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || !['--instance', '--verify-instance'].includes(process.argv[2])) throw new Error('expected --instance or --verify-instance name')
    if (process.argv[2] === '--verify-instance') {
      assertLocalQaBindings(process.argv[3])
      console.log('QA loopback bindings verified')
    } else console.log(ensureLocalQaNetwork(process.argv[3]))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
