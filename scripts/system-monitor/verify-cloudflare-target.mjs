import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function verifyCloudflareTarget(input) {
  const expected = input?.expected
  if (!expected || !/^[0-9a-f]{32}$/u.test(expected.accountId ?? '') ||
      !/^[0-9a-f-]{36}$/u.test(expected.databaseId ?? '') ||
      typeof expected.databaseName !== 'string' || expected.databaseName.length < 1) {
    throw new Error('CLOUDFLARE_EXPECTED_TARGET_INVALID')
  }

  const whoami = parseJson(input.whoami)
  const d1Databases = parseJson(input.d1Databases)
  const accounts = collectObjects(whoami).filter((value) => value.id === expected.accountId)
  if (accounts.length === 0) throw new Error('CLOUDFLARE_ACCOUNT_MISMATCH')

  const databases = collectObjects(d1Databases)
  const matchingDatabase = databases.some((value) => {
    const databaseId = value.uuid ?? value.database_id ?? value.id
    const databaseName = value.name ?? value.database_name
    return databaseId === expected.databaseId && databaseName === expected.databaseName
  })
  if (!matchingDatabase) throw new Error('CLOUDFLARE_D1_TARGET_MISMATCH')

  return Object.freeze({
    status: 'verified',
    accountId: expected.accountId,
    databaseId: expected.databaseId,
    databaseName: expected.databaseName,
  })
}

function parseJson(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('CLOUDFLARE_TARGET_OUTPUT_INVALID')
  }
}

function collectObjects(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, result)
    return result
  }
  if (value && typeof value === 'object') {
    result.push(value)
    for (const item of Object.values(value)) collectObjects(item, result)
  }
  return result
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main(args) {
  const whoamiPath = args[args.indexOf('--whoami') + 1]
  const d1Path = args[args.indexOf('--d1-list') + 1]
  const releasePath = args[args.indexOf('--release') + 1]
  const outputPath = args[args.indexOf('--output') + 1]
  if ([whoamiPath, d1Path, releasePath, outputPath].some((value) => !value || value.startsWith('--'))) {
    throw new Error('CLOUDFLARE_TARGET_ARGUMENTS_INVALID')
  }

  const observer = readJson(releasePath).systemHealthObserver
  if (!observer) throw new Error('CLOUDFLARE_RELEASE_IDENTITY_MISSING')
  const target = verifyCloudflareTarget({
    whoami: readJson(whoamiPath),
    d1Databases: readJson(d1Path),
    expected: {
      accountId: observer.cloudflareAccountId,
      databaseId: observer.d1Database.id,
      databaseName: observer.d1Database.name,
    },
  })
  writeFileSync(outputPath, `${JSON.stringify(target, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write('Cloudflare account and D1 target verified\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'CLOUDFLARE_TARGET_VERIFICATION_FAILED'}\n`)
    process.exitCode = 1
  }
}
