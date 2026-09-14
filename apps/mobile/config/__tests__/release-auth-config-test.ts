import { resolve } from 'node:path'
import { assertReleaseAuthConfig, resolveMobileEnvFiles } from '../release-auth-config.cjs'

describe('assertReleaseAuthConfig', () => {
  it('blocks an EAS build that would ship without Supabase login config', () => {
    expect(() => assertReleaseAuthConfig({
      apiBaseUrl: '',
      buildProfile: 'preview',
      isEasBuild: true,
      supabasePublishableKey: '',
      supabaseUrl: '',
    })).toThrow('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  })

  it('allows local previews and configured EAS builds', () => {
    expect(() => assertReleaseAuthConfig({
      apiBaseUrl: '',
      buildProfile: '',
      isEasBuild: false,
      supabasePublishableKey: '',
      supabaseUrl: '',
    })).not.toThrow()
    expect(() => assertReleaseAuthConfig({
      apiBaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
      buildProfile: 'preview',
      isEasBuild: true,
      supabasePublishableKey: 'sb_publishable_test-key',
      supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    })).not.toThrow()
  })

  it('rejects server authority and a mismatched Edge target in EAS builds', () => {
    const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    const serviceRoleJwt = `header.${serviceRolePayload}.signature`
    const base = {
      apiBaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
      buildProfile: 'preview',
      isEasBuild: true,
      supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    }

    expect(() => assertReleaseAuthConfig({
      ...base,
      supabasePublishableKey: 'sb_secret_server-authority',
    })).toThrow('publishable')
    expect(() => assertReleaseAuthConfig({
      ...base,
      supabasePublishableKey: serviceRoleJwt,
    })).toThrow('publishable')
    expect(() => assertReleaseAuthConfig({
      ...base,
      apiBaseUrl: 'https://attacker.example/functions/v1/mobile-api',
      supabasePublishableKey: 'sb_publishable_test-key',
    })).toThrow('same Supabase origin')
  })

  it('accepts a legacy anon JWT but rejects non-default Supabase ports', () => {
    const anonPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')
    const anonJwt = `header.${anonPayload}.signature`
    const base = {
      apiBaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
      buildProfile: 'preview',
      isEasBuild: true,
      supabasePublishableKey: anonJwt,
      supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    }

    expect(() => assertReleaseAuthConfig(base)).not.toThrow()
    expect(() => assertReleaseAuthConfig({
      ...base,
      apiBaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co:8443/functions/v1/mobile-api',
      supabaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co:8443',
    })).toThrow('default HTTPS port')
  })

  it.each(['production', 'native-proof-production'])('pins %s EAS builds to the production Supabase project', (buildProfile) => {
    const input = {
      apiBaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
      buildProfile,
      isEasBuild: true,
      supabasePublishableKey: 'sb_publishable_test-key',
      supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    }

    expect(() => assertReleaseAuthConfig(input)).not.toThrow()
    expect(() => assertReleaseAuthConfig({
      ...input,
      apiBaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
      supabaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
    })).toThrow('registered Production Supabase project')
  })

  it('rejects a stale staging target for every EAS profile', () => {
    const input = {
      apiBaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
      buildProfile: 'preview',
      isEasBuild: true,
      supabasePublishableKey: 'sb_publishable_test-key',
      supabaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
    }

    expect(() => assertReleaseAuthConfig(input)).toThrow('Production Supabase project')
  })

  it('uses the ignored mobile Production config as a local fallback but never as an EAS build input', () => {
    const input = {
      configDir: resolve('C:/NestScout/apps/mobile'),
      explicitEnvFiles: [],
      repoRoot: resolve('C:/NestScout'),
    }

    expect(resolveMobileEnvFiles({ ...input, isEasBuild: false })).toContain(resolve(input.configDir, '.env.production'))
    expect(resolveMobileEnvFiles({ ...input, isEasBuild: true })).not.toContain(resolve(input.configDir, '.env.production'))
  })
})
