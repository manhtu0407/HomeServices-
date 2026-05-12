type EnvConfig = {
  client: string[]
  server: string[]
}

const config: EnvConfig = {
  client: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ],
  server: [
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'PERPLEXITY_API_KEY',
    'DEEPSEEK_API_KEY',
  ],
}

const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SUPABASE_URL

function validateClientEnv() {
  if (isBuildTime) return

  const missing: string[] = []

  for (const key of config.client) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required client environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCheck your .env.local file.`
    )
  }
}

function requireServerKey(key: string, label: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${label} not configured. Set ${key} in .env.local`)
  }
  return value
}

export const env = {
  get supabaseUrl(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL!
  },
  get supabasePublishableKey(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  },
  get supabaseServiceRoleKey(): string {
    return requireServerKey('SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key')
  },
  get anthropicApiKey(): string {
    return requireServerKey('ANTHROPIC_API_KEY', 'Anthropic API key')
  },
  get perplexityApiKey(): string {
    return requireServerKey('PERPLEXITY_API_KEY', 'Perplexity API key')
  },
  get deepseekApiKey(): string {
    return requireServerKey('DEEPSEEK_API_KEY', 'DeepSeek API key')
  },
} as const

validateClientEnv()

export function ensureServerEnv() {
  if (typeof window !== 'undefined') return

  const missing: string[] = []

  for (const key of config.server) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required server environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCheck your .env.local file.`
    )
  }
}
