import { readFile } from 'node:fs/promises'
import type { GlobalSetupContext } from 'vitest/node'

export default async function systemMonitorGlobalSetup({ provide }: GlobalSetupContext) {
  const migration = await readFile(new URL('./migrations/0001_initial.sql', import.meta.url), 'utf8')
  provide('systemMonitorD1Migration', migration)
}
