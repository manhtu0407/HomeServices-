import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EVIDENCE_ROOT = resolve(ROOT, 'docs/foundation/source-trust-samples')
const ledgerNames = readdirSync(EVIDENCE_ROOT)
  .filter((name) => /^price-baseline-.*-ledger\.json$/u.test(name))
  .sort()

if (ledgerNames.length === 0) {
  throw new Error('No price-evidence ledgers were found')
}

let artifactCount = 0
for (const ledgerName of ledgerNames) {
  const ledger = JSON.parse(readFileSync(resolve(EVIDENCE_ROOT, ledgerName), 'utf8'))
  if (ledger.schema_version !== 'price_source_evidence_ledger.v1'
    || !Array.isArray(ledger.sources)
    || ledger.sources.length < 2) {
    throw new Error(`${ledgerName}: invalid evidence ledger`)
  }

  for (const source of ledger.sources) {
    for (const prefix of ['price_snapshot', 'identity_snapshot']) {
      const relativePath = source.artifacts?.[prefix]
      const expectedHash = source.artifacts?.[`${prefix}_sha256`]
      if (typeof relativePath !== 'string' || !/^docs\/foundation\/source-trust-samples\/.*\.(?:jpe?g|png)$/u.test(relativePath)) {
        throw new Error(`${ledgerName}: invalid ${prefix} path for ${source.domain}`)
      }
      if (typeof expectedHash !== 'string' || !/^[A-F0-9]{64}$/u.test(expectedHash)) {
        throw new Error(`${ledgerName}: invalid ${prefix} checksum for ${source.domain}`)
      }

      const artifactPath = resolve(ROOT, relativePath)
      if (!artifactPath.startsWith(`${EVIDENCE_ROOT}${sep}`)) {
        throw new Error(`${ledgerName}: ${prefix} escapes the evidence directory`)
      }
      const actualHash = createHash('sha256')
        .update(readFileSync(artifactPath))
        .digest('hex')
        .toUpperCase()
      if (actualHash !== expectedHash) {
        throw new Error(`${ledgerName}: ${prefix} checksum mismatch for ${source.domain}`)
      }
      artifactCount += 1
    }
  }
}

console.log(`price evidence artifacts ok: ${ledgerNames.length} ledgers, ${artifactCount} snapshots`)
