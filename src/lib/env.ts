type EnvConfig = {
  required: string[]
  serverOnly: string[]
}

const config: EnvConfig = {
  required: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ],
  serverOnly: [
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'PERPLEXITY_API_KEY',
    'DEEPSEEK_API_KEY',
  ],
}

function validateEnv() {
  const missing: string[] = []

  for (const key of config.required) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCheck your .env.local file.`
    )
  }
}

export const env = {
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL!
  },
  get supabasePublishableKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY ?? ''
  },
  get perplexityApiKey() {
    return process.env.PERPLEXITY_API_KEY ?? ''
  },
  get deepseekApiKey() {
    return process.env.DEEPSEEK_API_KEY ?? ''
  },
} as const

validateEnv()
