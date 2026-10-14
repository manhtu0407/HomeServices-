import { chmodSync, lstatSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const OBSERVER_SECRET_PATTERN = /^[0-9a-f]{64}$/u

export function writeObserverSecretFile(filePath, observerSecret) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('OBSERVER_SECRET_FILE_PATH_REQUIRED')
  }
  if (typeof observerSecret !== 'string' || !OBSERVER_SECRET_PATTERN.test(observerSecret)) {
    throw new Error('SYSTEM_HEALTH_OBSERVER_SECRET_INVALID')
  }

  const target = lstatSync(filePath)
  if (!target.isFile() || target.isSymbolicLink() || target.size !== 0) {
    throw new Error('OBSERVER_SECRET_FILE_TARGET_INVALID')
  }

  try {
    writeFileSync(filePath, `${JSON.stringify({ SYSTEM_HEALTH_OBSERVER_SECRET: observerSecret })}\n`, {
      flag: 'w',
      mode: 0o600,
    })
    chmodSync(filePath, 0o600)
  } catch {
    throw new Error('OBSERVER_SECRET_FILE_WRITE_FAILED')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    writeObserverSecretFile(process.argv[2] ?? '', process.env.SYSTEM_HEALTH_OBSERVER_SECRET ?? '')
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : 'OBSERVER_SECRET_FILE_WRITE_FAILED'
    process.stderr.write(`${code}\n`)
    process.exitCode = 1
  }
}
