import { resolveMobilePublicAuthEnv } from '../public-auth-env'

describe('resolveMobilePublicAuthEnv', () => {
  it('supports the legacy public Supabase names used by the local workspace config', () => {
    expect(resolveMobilePublicAuthEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://legacy-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon-key',
    })).toEqual({
      supabasePublishableKey: 'legacy-anon-key',
      supabaseUrl: 'https://legacy-project.supabase.co',
    })
  })

  it('prefers the explicit Expo names and never reads a server-only key name', () => {
    expect(resolveMobilePublicAuthEnv({
      EXPO_PUBLIC_SUPABASE_URL: ' https://expo-project.supabase.co ',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' expo-publishable-key ',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'server-authority-must-not-be-read',
    })).toEqual({
      supabasePublishableKey: 'expo-publishable-key',
      supabaseUrl: 'https://expo-project.supabase.co',
    })

    expect(resolveMobilePublicAuthEnv({
      SUPABASE_ANON_KEY: 'unscoped-key',
    })).toEqual({
      supabasePublishableKey: '',
      supabaseUrl: '',
    })
  })

  it('keeps the existing process-over-local precedence for each public name', () => {
    expect(resolveMobilePublicAuthEnv(
      { EXPO_PUBLIC_SUPABASE_URL: 'https://process.supabase.co' },
      { EXPO_PUBLIC_SUPABASE_URL: 'https://local.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://legacy.supabase.co' },
    ).supabaseUrl).toBe('https://process.supabase.co')
  })
})
