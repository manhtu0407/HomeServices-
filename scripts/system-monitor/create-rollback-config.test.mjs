import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createCloudflareObserverRollbackConfig } from './create-rollback-config.mjs'

test('creates a sibling config that removes Cron while retaining the Worker and D1 binding', () => {
  const root = mkdtempSync(join(tmpdir(), 'system-health-rollback-'))
  const configPath = join(root, 'wrangler.jsonc')
  const outputPath = join(root, 'wrangler.rollback.jsonc')
  const source = {
    name: 'nestscout-system-health-observer',
    main: './index.ts',
    triggers: { crons: ['* * * * *'] },
    d1_databases: [{ binding: 'DB', database_name: 'monitor', database_id: '33d39ec6-73a4-44e6-b030-fb9ee3e4f281', migrations_dir: './migrations' }],
  }
  writeFileSync(configPath, JSON.stringify(source))
  try {
    const evidence = createCloudflareObserverRollbackConfig(configPath, outputPath)
    const rollback = JSON.parse(readFileSync(outputPath, 'utf8'))
    assert.deepEqual(rollback.triggers.crons, [])
    assert.equal(rollback.name, source.name)
    assert.equal(rollback.main, source.main)
    assert.equal(rollback.d1_databases[0].database_id, source.d1_databases[0].database_id)
    assert.deepEqual(evidence.cronSchedules, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('requires a sibling path so relative bundle and migration paths keep their meaning', () => {
  const root = mkdtempSync(join(tmpdir(), 'system-health-rollback-path-'))
  const configPath = join(root, 'wrangler.jsonc')
  writeFileSync(configPath, JSON.stringify({ triggers: { crons: ['* * * * *'] }, d1_databases: [{ binding: 'DB' }] }))
  try {
    assert.throws(
      () => createCloudflareObserverRollbackConfig(configPath, join(root, 'nested', 'rollback.jsonc')),
      /CLOUDFLARE_ROLLBACK_CONFIG_LOCATION_INVALID/u,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
