import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { KAEL_ROUTING_CONFIG } from "../../kael/kael-providers/routing.config.ts";
import type { AIProvider, KaelPurpose } from "../../kael/contracts/types.ts";

const PROVIDER_KEY_ENV: Readonly<Record<AIProvider, string>> = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
});

export function getKaelModelHealth(ctx: MobileApiContext) {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xem cấu hình model Kael", 403);
  }
  const models = new Map<string, {
    provider: AIProvider;
    model: string;
    purposes: KaelPurpose[];
    configured: boolean;
  }>();
  for (const config of Object.values(KAEL_ROUTING_CONFIG)) {
    for (const route of [
      config.primary,
      config.simpleNormalChatPrimary,
      config.modelFallback,
      config.fallback,
      config.escalation,
    ]) {
      if (!route) continue;
      const key = `${route.provider}:${route.model}`;
      const current = models.get(key) ?? {
        provider: route.provider,
        model: route.model,
        purposes: [],
        configured: providerConfigured(route.provider),
      };
      if (!current.purposes.includes(config.purpose)) current.purposes.push(config.purpose);
      models.set(key, current);
    }
  }
  return {
    checked_at: new Date().toISOString(),
    mode: "configuration" as const,
    note: "This route reports configured model inventory only. Use kael:model-health for an operator-run provider I/O probe.",
    models: [...models.values()]
      .map((entry) => ({ ...entry, purposes: [...entry.purposes].sort() }))
      .sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`)),
  };
}

function providerConfigured(provider: AIProvider): boolean {
  try {
    const denoGet = (globalThis as {
      Deno?: { env?: { get?: (key: string) => string | undefined } };
    }).Deno?.env?.get;
    return Boolean(denoGet?.(PROVIDER_KEY_ENV[provider])?.trim());
  } catch {
    return false;
  }
}
