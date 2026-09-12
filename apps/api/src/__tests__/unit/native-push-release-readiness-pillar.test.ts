import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P72-native-push-release-readiness',
  invariant:
    'a Production release can count remote Worker reachability only when both native push platforms, hosted receipt reconciliation, and kouuuuuu exact-head approval are fail-closed gates',
  authority: [
    'governance/RULES.md #5 (real runtime evidence cannot be replaced by a source claim)',
    'governance/RULES.md #7 (human authority remains explicit)',
  ],
  target: '.github/workflows/release-production.yml',
  layer: 'security-negative',
  siblings: ['P37-ios-release-readiness', 'P57-stage1-provider-push-receipt'],
  mutation:
    'remove expo-notifications, the hosted receipt reconciler call, either provider flag, or the exact reviewer argument — the corresponding source gate turns red',
} as const satisfies PillarManifest

const rootFile = (path: string) => readFileSync(resolve(process.cwd(), '../..', path), 'utf8')

describe('native push and Production release readiness', () => {
  it('enables native notification configuration without stripping iOS entitlements', () => {
    const dynamicConfig = rootFile('apps/mobile/app.config.ts')
    const staticConfig = JSON.parse(rootFile('apps/mobile/app.json')) as {
      expo?: { plugins?: unknown[]; extra?: { iosPushNotificationsEnabled?: boolean } }
    }

    expect(dynamicConfig, pillarWhy(PILLAR, 'dynamic Expo config must own APNs and FCM wiring')).toContain(
      "'expo-notifications'",
    )
    expect(dynamicConfig).toContain("fromEnv('GOOGLE_SERVICES_JSON')")
    expect(dynamicConfig).toContain('const iosPushNotificationsEnabled = true')
    expect(dynamicConfig).not.toContain("delete config.modResults['aps-environment']")
    expect(dynamicConfig).not.toContain("removeSystemCapabilities(['com.apple.Push'])")
    expect(staticConfig.expo?.plugins).toContain('expo-notifications')
    expect(staticConfig.expo?.extra?.iosPushNotificationsEnabled).toBe(true)
  })

  it('reconciles Expo provider receipts from the durable hosted maintainer', () => {
    const maintainer = rootFile('supabase/functions/kael-matching-maintainer/index.ts')

    expect(maintainer, pillarWhy(PILLAR, 'a send ticket alone is not proof of delivery')).toContain(
      'reconcileMatchingPushReceipts',
    )
    expect(maintainer).toMatch(/await\s+reconcileMatchingPushReceipts\(dbClient,\s*maintainerId\)/u)
    expect(maintainer).toContain('push_receipts_provider_handoffs')
    expect(maintainer).toContain('push_receipts_failed')
  })

  it('fails Production release construction unless APNs, FCM v1, and receipt reconciliation are proven', () => {
    const releaseBundle = rootFile('scripts/harness/release-bundle.mjs')
    const releaseWorkflow = rootFile('.github/workflows/release-production.yml')

    for (const readinessKey of ['android_fcm_v1', 'ios_apns', 'push_receipt_reconciler']) {
      expect(releaseBundle).toContain(readinessKey)
    }
    for (const flag of [
      'NESTSCOUT_ANDROID_FCM_V1_READY',
      'NESTSCOUT_IOS_APNS_READY',
      'NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY',
    ]) {
      expect(releaseBundle).toContain(flag)
      expect(releaseWorkflow).toContain(`test \"$${flag}\" = \"true\"`)
    }
  })

  it('requires kouuuuuu approval for the exact merged head before either release phase', () => {
    const releaseWorkflow = rootFile('.github/workflows/release-production.yml')
    const approvalHarness = rootFile('scripts/harness/github-merge-approval.mjs')

    expect(releaseWorkflow.match(/--reviewer kouuuuuu/gu)).toHaveLength(2)
    expect(approvalHarness).toContain("schemaVersion: 'github-reviewed-main-merge.v2'")
    expect(approvalHarness).toContain('review.user.login === input.requiredReviewer')
    expect(approvalHarness).toContain('review?.actor !== receipt.requiredReviewer')
  })
})
