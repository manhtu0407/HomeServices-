type EnvConfig = {
  client: string[]
  server: string[]
}

const PRODUCTION_SUPABASE_HOST = 'iwevizmsedyqozxlawwl.supabase.co'

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

const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'

function validateClientEnvAtImport() {
  if (isBuildTime || process.env.NODE_ENV === 'production') return

  ensureClientEnv()
}

export function ensureClientEnv() {
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

function requireClientKey(key: string, label: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${label} not configured. Set ${key} in .env.local`)
  }
  return value
}

function requireTrustedSupabaseUrl(): string {
  const raw = requireClientKey('NEXT_PUBLIC_SUPABASE_URL', 'Supabase URL').trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Supabase URL is invalid')
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  const isHostedProject = url.protocol === 'https:' && url.port === '' &&
    url.hostname === PRODUCTION_SUPABASE_HOST
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
  if (
    (!isLoopback && !isHostedProject) ||
    (isLoopback && url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username || url.password || url.search || url.hash || normalizedPath !== '/'
  ) {
    throw new Error('Supabase URL must use an exact trusted project root from the local stack or registered Production project')
  }
  return url.origin
}

function requirePublishableSupabaseKey(): string {
  const value = requireClientKey(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'Supabase publishable key',
  ).trim()
  if (value.startsWith('sb_publishable_') && value.length > 'sb_publishable_'.length) {
    return value
  }
  const parts = value.split('.')
  if (parts.length === 3) {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
      const payload = JSON.parse(atob(padded)) as { role?: unknown }
      if (payload.role === 'anon') return value
    } catch {
      // Fall through to the single safe configuration error below.
    }
  }
  throw new Error('Supabase publishable key must not contain server authority')
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
    return requireTrustedSupabaseUrl()
  },
  get supabasePublishableKey(): string {
    return requirePublishableSupabaseKey()
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

  get learningEnabled(): boolean {
    return process.env.LEARNING_ENABLED === 'true'
  },
  get learningReviewQueueEnabled(): boolean {
    return process.env.LEARNING_WRITE_ENABLED === 'true' ||
      process.env.LEARNING_AUTOPROMOTE_ENABLED === 'true'
  },
  get learningAutopromoteEnabled(): boolean {
    return false
  },
} as const

validateClientEnvAtImport()

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
