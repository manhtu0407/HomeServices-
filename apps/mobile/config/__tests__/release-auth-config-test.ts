import { resolve } from 'node:path'

const { assertReleaseAuthConfig, resolveMobileEnvFiles } = require('../release-auth-config.cjs') as {
  assertReleaseAuthConfig: (input: {
    isEasBuild: boolean
    supabasePublishableKey: string
    supabaseUrl: string
  }) => void
  resolveMobileEnvFiles: (input: {
    configDir: string
    explicitEnvFiles: string[]
    isEasBuild: boolean
    repoRoot: string
  }) => string[]
}

describe('assertReleaseAuthConfig', () => {
  it('blocks an EAS build that would ship without Supabase login config', () => {
    expect(() => assertReleaseAuthConfig({
      isEasBuild: true,
      supabasePublishableKey: '',
      supabaseUrl: '',
    })).toThrow('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  })

  it('allows local previews and configured EAS builds', () => {
    expect(() => assertReleaseAuthConfig({
      isEasBuild: false,
      supabasePublishableKey: '',
      supabaseUrl: '',
    })).not.toThrow()
    expect(() => assertReleaseAuthConfig({
      isEasBuild: true,
      supabasePublishableKey: 'public-key',
      supabaseUrl: 'https://example.supabase.co',
    })).not.toThrow()
  })

  it('uses the ignored mobile staging config as a local fallback but never as an EAS build input', () => {
    const input = {
      configDir: resolve('C:/NestScout/apps/mobile'),
      explicitEnvFiles: [],
      repoRoot: resolve('C:/NestScout'),
    }

    expect(resolveMobileEnvFiles({ ...input, isEasBuild: false })).toContain(resolve(input.configDir, '.env.staging'))
    expect(resolveMobileEnvFiles({ ...input, isEasBuild: true })).not.toContain(resolve(input.configDir, '.env.staging'))
  })
})
