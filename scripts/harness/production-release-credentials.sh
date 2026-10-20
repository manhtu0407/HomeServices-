#!/usr/bin/env bash
set -euo pipefail

service='nestscout-production-release'
allowed=(
  ANTHROPIC_API_KEY CLOUDFLARE_API_TOKEN DEEPSEEK_API_KEY EXPO_TOKEN PERPLEXITY_API_KEY
  PRODUCTION_SUPABASE_ANON_KEY PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
  PRODUCTION_SYNTHETIC_CUSTOMER_EMAIL PRODUCTION_SYNTHETIC_CUSTOMER_PASSWORD
  PRODUCTION_SYNTHETIC_WORKER_EMAIL PRODUCTION_SYNTHETIC_WORKER_PASSWORD
  SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SYSTEM_HEALTH_MONITOR_SECRET
  SYSTEM_HEALTH_OBSERVER_SECRET VIETMAP_API_KEY
)

command_name="${1:-}"
secret_name="${2:-}"
if [[ "$command_name" != set || ! " ${allowed[*]} " =~ " $secret_name " ]]; then
  printf '%s\n' 'usage: production-release-credentials.sh set <allow-listed-name>' >&2
  exit 2
fi
if ! command -v secret-tool >/dev/null 2>&1; then
  printf '%s\n' 'LINUX_SECRET_SERVICE_UNAVAILABLE' >&2
  exit 1
fi

read -r -s -p "Enter the secret value for $secret_name: " secret_value
printf '\n'
if [[ -z "$secret_value" ]]; then
  unset secret_value
  printf '%s\n' 'CREDENTIAL_VALUE_REQUIRED' >&2
  exit 1
fi
printf '%s' "$secret_value" | secret-tool store --label='NestScout Production Release' application "$service" name "$secret_name"
unset secret_value
printf 'Stored credential: %s\n' "$secret_name"
