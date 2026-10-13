import { readFile } from 'node:fs/promises'
import type { GlobalSetupContext } from 'vitest/node'

export default async function systemMonitorGlobalSetup({ provide }: GlobalSetupContext) {
  const initial = await readFile(new URL('./migrations/0001_initial.sql', import.meta.url), 'utf8')
  const occurrences = await readFile(new URL('./migrations/0002_observer_occurrences_and_ticks.sql', import.meta.url), 'utf8')
  const availability = await readFile(new URL('./migrations/0003_supabase_availability_streak.sql', import.meta.url), 'utf8')
  const migration = `${initial}\n${occurrences}`
  provide('systemMonitorD1Migration', migration)
  provide('systemMonitorD1AvailabilityMigration', availability)
}
