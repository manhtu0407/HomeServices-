import { readFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const out = process.argv[3]
const { canonicalMigrationEntries } = await import(pathToFileURL(`${root}/scripts/harness/migration-history.mjs`).href)
const inventory = JSON.parse(readFileSync(`${root}/config/harness/migration-inventory.json`, 'utf8'))
const entries = canonicalMigrationEntries(inventory)
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const entry of entries) copyFileSync(`${root}/${entry.file}`, `${out}/${entry.file.split('/').pop()}`)
console.log(`${entries.length} canonical migrations of ${inventory.entries.length} inventory entries`)
