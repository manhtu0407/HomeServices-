import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(__dirname, '../../../../..')
const ledgerPath = resolve(
  repositoryRoot,
  'docs/foundation/source-trust-samples/price-baseline-six-services-20260815-ledger.json',
)
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
  schema_version: string
  services: Array<{
    service_type: string
    sources: Array<{
      artifacts: {
        identity_snapshot: string
        identity_snapshot_sha256: string
        price_snapshot: string
        price_snapshot_sha256: string
      }
    }>
  }>
}

describe('six-service price evidence artifacts', () => {
  it('binds every new source claim to a byte-exact evidence artifact', () => {
    expect(ledger.schema_version).toBe('price_source_evidence_ledger.v1')
    expect(ledger.services.map((service) => service.service_type).sort()).toEqual([
      'cleaning',
      'electrical',
      'hvac',
      'upholstery',
    ])

    for (const service of ledger.services) {
      expect(service.sources.length).toBeGreaterThanOrEqual(2)
      for (const source of service.sources) {
        for (const [artifactKey, hashKey] of [
          ['price_snapshot', 'price_snapshot_sha256'],
          ['identity_snapshot', 'identity_snapshot_sha256'],
        ] as const) {
          const artifactPath = resolve(repositoryRoot, source.artifacts[artifactKey])
          expect(existsSync(artifactPath)).toBe(true)
          const digest = createHash('sha256')
            .update(readFileSync(artifactPath))
            .digest('hex')
            .toUpperCase()
          expect(digest).toBe(source.artifacts[hashKey])
        }
      }
    }
  })
})
