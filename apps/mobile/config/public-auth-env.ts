export type PublicAuthEnvSource = Readonly<Record<string, string | undefined>>

const supabaseUrlEnvNames = ['EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const
const supabaseKeyEnvNames = [
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

function firstNonEmptyValue(sources: readonly PublicAuthEnvSource[], names: readonly string[]) {
  for (const name of names) {
    for (const source of sources) {
      const value = source[name]?.trim()
      if (value) return value
    }
  }
  return ''
}

export function resolveMobilePublicAuthEnv(...sources: PublicAuthEnvSource[]) {
  return {
    supabasePublishableKey: firstNonEmptyValue(sources, supabaseKeyEnvNames),
    supabaseUrl: firstNonEmptyValue(sources, supabaseUrlEnvNames),
  }
}
