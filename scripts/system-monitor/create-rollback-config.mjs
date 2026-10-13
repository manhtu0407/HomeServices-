import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function createCloudflareObserverRollbackConfig(configPath, outputPath) {
  const sourcePath = resolve(configPath)
  const destinationPath = resolve(outputPath)
  if (dirname(sourcePath) !== dirname(destinationPath)) throw new Error('CLOUDFLARE_ROLLBACK_CONFIG_LOCATION_INVALID')

  let config
  try {
    config = JSON.parse(readFileSync(sourcePath, 'utf8'))
  } catch {
    throw new Error('CLOUDFLARE_ROLLBACK_CONFIG_SOURCE_INVALID')
  }
  if (!Array.isArray(config.triggers?.crons) || config.triggers.crons.length === 0 ||
      !Array.isArray(config.d1_databases) || !config.d1_databases.some((binding) => binding.binding === 'DB')) {
    throw new Error('CLOUDFLARE_ROLLBACK_CONFIG_SOURCE_INVALID')
  }

  const rollback = {
    ...config,
    triggers: { ...config.triggers, crons: [] },
  }
  writeFileSync(destinationPath, `${JSON.stringify(rollback, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return Object.freeze({
    configPath: destinationPath,
    workerName: rollback.name,
    cronSchedules: rollback.triggers.crons,
    d1DatabaseId: rollback.d1_databases.find((binding) => binding.binding === 'DB').database_id,
  })
}

function main(args) {
  const outputPath = args[args.indexOf('--output') + 1]
  const configPath = resolve('scripts/system-monitor/wrangler.jsonc')
  if (!outputPath || outputPath.startsWith('--')) throw new Error('CLOUDFLARE_ROLLBACK_CONFIG_ARGUMENTS_INVALID')
  createCloudflareObserverRollbackConfig(configPath, outputPath)
  process.stdout.write('rollback config prepared with Cloudflare Cron triggers disabled\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'CLOUDFLARE_ROLLBACK_CONFIG_FAILED'}\n`)
    process.exitCode = 1
  }
}
