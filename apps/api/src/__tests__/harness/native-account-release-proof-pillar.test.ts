import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P77-native-account-release-proof',
  invariant:
    'exact-source iOS Simulator and Android Emulator builds exercise Customer and Worker normal-account boundaries with protected credentials and retain explicit non-physical evidence limits',
  authority: [
    'approved Production Agentic Transaction Readiness plan (native reproducibility)',
    'governance/critical.md #3 (No False Completion)',
  ],
  target: 'apps/mobile/.eas/workflows/native-account-release-proof.yml',
  layer: 'security-negative',
  siblings: ['P37-ios-release-readiness', 'P72-native-push-release-readiness', 'P76-production-ui-language-normality'],
  mutation:
    'remove exact SHA/source binding, expose account credentials, skip one platform or persona, or call emulator evidence physical proof — this pillar turns red',
} as const satisfies PillarManifest

const root = resolve(import.meta.dirname, '../../../../..')

describe('native account and release proof workflow', () => {
  const workflow = readFileSync(resolve(root, 'apps/mobile/.eas/workflows/native-account-release-proof.yml'), 'utf8')
  const customerFlow = readFileSync(resolve(root, 'apps/mobile/.maestro/customer-login-proof.yaml'), 'utf8')
  const workerFlow = readFileSync(resolve(root, 'apps/mobile/.maestro/worker-login-proof.yaml'), 'utf8')
  const eas = JSON.parse(readFileSync(resolve(root, 'apps/mobile/eas.json'), 'utf8'))

  it('builds emulator-compatible binaries against environment-locked hosted projects', () => {
    expect(eas.build['native-proof-staging'].ios.simulator).toBe(true)
    expect(eas.build['native-proof-staging'].android.buildType).toBe('apk')
    expect(eas.build['native-proof-staging'].environment).toBe('preview')
    expect(eas.build['native-proof-production'].ios.simulator).toBe(true)
    expect(eas.build['native-proof-production'].android.buildType).toBe('apk')
    expect(eas.build['native-proof-production'].environment).toBe('production')
    expect(workflow, pillarWhy(PILLAR, 'Production source must equal origin/main')).toContain('git rev-parse origin/main')
    expect(workflow, pillarWhy(PILLAR, 'source hash is recomputed')).toContain('sourceBundleSha256')
    expect(workflow, pillarWhy(PILLAR, 'custom jobs start without project files')).toContain('uses: eas/checkout')
    expect(workflow.indexOf('uses: eas/checkout')).toBeLessThan(workflow.indexOf('uses: eas/install_node_modules'))
    expect(workflow.indexOf('uses: eas/install_node_modules')).toBeLessThan(workflow.indexOf('- id: identity'))
    expect(workflow).not.toContain('environment: ${{ inputs.target_environment }}')
    expect(workflow.match(/type: maestro/gu)?.length).toBe(2)
    expect(workflow.match(/record_screen: true/gu)?.length).toBe(2)
  })

  it('uses protected credentials and proves provider separation through normal UI login', () => {
    for (const variable of [
      'MAESTRO_CUSTOMER_EMAIL', 'MAESTRO_CUSTOMER_PASSWORD',
      'MAESTRO_WORKER_EMAIL', 'MAESTRO_WORKER_PASSWORD',
    ]) expect(workflow, pillarWhy(PILLAR, `protected ${variable}`)).toContain(variable)
    expect(workflow).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)
    expect(customerFlow.match(/id: auth-entry-role-customer/gu)?.length).toBe(2)
    expect(customerFlow).toContain('id: auth-client-google-primary')
    expect(customerFlow).toContain('id: auth-client-apple-secondary')
    expect(customerFlow).toContain('id: customer-runtime-marker')
    expect(workerFlow.match(/id: auth-entry-role-worker/gu)?.length).toBe(2)
    expect(workerFlow).toContain('assertNotVisible:')
    expect(workerFlow).toContain('id: worker-v5-screen-1.1-worker-home')
  })

  it('writes checksummed identity beside screenshots while refusing to call it physical proof', () => {
    expect(workflow.match(/native-evidence-receipt\.mjs/gu)?.length).toBe(2)
    expect(workflow).toContain('NATIVE_EVIDENCE_SOURCE_BUNDLE_SHA256')
    expect(workflow).toContain('does not')
    expect(workflow).toContain('physical APNs/FCM delivery')
    expect(customerFlow).toContain('takeScreenshot: customer-home-release-identity')
    expect(workerFlow).toContain('takeScreenshot: worker-home-readiness')
  })
})
