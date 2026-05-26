import type { AIMessage, ComplexityLevel, ServiceType } from "./types.ts";
import { KAEL_BUSINESS_GUARDRAILS, KAEL_RESPONSE_STYLE } from "./types.ts";

export const SOURCE_TRUST_VERSION = "source-trust-r1-1779781564809";

export const TIER_1_SOURCE_TRUST_DOMAINS = Object.freeze([
  "btaskee.com",
  "jupviec.vn",
  "tuoitre.vn",
  "thanhnien.vn",
  "dienmayxanh.com",
  "suachuatainha.com.vn",
  "tktclean.com",
  "cleanipedia.com",
  "hoanmyclean.vn",
  "thoviet.com.vn",
  "thosaigon.vn",
  "suadiennuocnamviet.com",
  "khodiennuoc.com",
  "f24.vn",
  "suadiennuocvn.net",
  "saigonfix.vn",
  "diennuochonglinh.com",
  "moitruongmiendong.com",
  "drhome.com.vn",
  "diennuochuongthinh.com",
] as const);

export function isSourceTrustPerplexityFilterEnabled(
  getEnv = readRuntimeEnv,
): boolean {
  const value = getEnv("KAEL_TRUST_PERPLEXITY_FILTER_ENABLED") ??
    getEnv("KAEL_OPT_SOURCE_TRUST_ENABLED");
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function trustedPerplexityMarketConfig(input: {
  serviceType: ServiceType;
  problem: string;
  complexity: ComplexityLevel;
  district: string;
}): {
  model: "sonar-pro";
  maxTokens: 600;
  timeoutMs: 6_000;
  searchDomainFilter: readonly string[];
  searchRecencyFilter: "month";
  searchMode: "web";
  searchContextSize: "medium";
  messages: AIMessage[];
  safeMetadata: Record<string, unknown>;
} {
  return {
    model: "sonar-pro",
    maxTokens: 600,
    timeoutMs: 6_000,
    searchDomainFilter: TIER_1_SOURCE_TRUST_DOMAINS,
    searchRecencyFilter: "month",
    searchMode: "web",
    searchContextSize: "medium",
    messages: buildTrustedPerplexityMarketMessages(input),
    safeMetadata: {
      source_trust_enabled: true,
      source_trust_version: SOURCE_TRUST_VERSION,
      search_domain_filter_count: TIER_1_SOURCE_TRUST_DOMAINS.length,
      search_recency_filter: "month",
      search_mode: "web",
      search_context_size: "medium",
      latency_budget_ms: 6_000,
    },
  };
}

function buildTrustedPerplexityMarketMessages(input: {
  serviceType: ServiceType;
  problem: string;
  complexity: ComplexityLevel;
  district: string;
}): AIMessage[] {
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

Bạn là price researcher cho dịch vụ sửa chữa và dọn dẹp căn hộ tại TP.HCM.
Chỉ dùng nguồn trong allowlist trusted Vietnamese domains đã được cấu hình ở request.

Khi tổng hợp giá:
- Ưu tiên ít nhất 2 nguồn khác nhau nếu dữ liệu có đủ.
- Loại giá quá cao hoặc quá thấp bất thường.
- Không dùng Facebook groups, forum cá nhân, blog cá nhân, hoặc trang rao vặt tự đăng.
- Không bịa giá nếu nguồn trusted không đủ.
- Nếu thiếu dữ liệu trusted, trả JSON: {"error":"insufficient_trusted_data"}.

Khi đủ dữ liệu, trả ONLY JSON đúng schema:
{
  "market_range_min": number,
  "market_range_max": number,
  "confidence": number,
  "sources_summary": "tóm tắt ngắn bằng tiếng Việt, có nhắc số nguồn trusted"
}`,
    },
    {
      role: "user",
      content: `Service: ${input.serviceType}
Problem: ${input.problem}
Complexity: ${input.complexity}
District: ${input.district}
Location: Ho Chi Minh City, Vietnam`,
    },
  ];
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name);
}
