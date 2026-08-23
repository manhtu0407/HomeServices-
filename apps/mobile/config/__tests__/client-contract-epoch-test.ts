import { resolveClientContractEpoch } from '../client-contract-epoch'

describe('resolveClientContractEpoch', () => {
  const releaseInput = {
    buildReleaseId: 'harness-123456789abc-123456789abc',
    gitSha: '1'.repeat(40),
  }

  it('enables the strict contract only for an attributable EAS build', () => {
    expect(resolveClientContractEpoch({
      ...releaseInput,
      easBuildId: 'b14c8cd0-a3f8-4ec6-ad64-6893b371af67',
    })).toBe('2')
  })

  it.each([
    '',
    'local-native-harness-123456789abc-123456789abc',
    'not-a-build-id',
  ])('keeps an unattested local build out of strict contract epoch 2: %s', (easBuildId) => {
    expect(resolveClientContractEpoch({ ...releaseInput, easBuildId })).toBe('')
  })
})
