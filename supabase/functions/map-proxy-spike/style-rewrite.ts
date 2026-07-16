// §37 MP0 việc 2 — pure VietMap style.json rewrite (spike, NOT wired into mobile-api).
//
// Contract: every URL in the style that points at a VietMap host (sources[].tiles,
// sources[].url TileJSON refs, top-level glyphs and sprite) is rewritten to go through
// the Edge proxy as /u/{host}/{path}, and EVERY api-key query parameter is stripped so
// the returned payload contains zero key material (RULES.md #0/#1, gate G2).
//
// Deliberate constraints:
// - No `new URL(...)`: WHATWG URL percent-encodes `{`/`}` (-> %7Bz%7D), which would
//   corrupt MapLibre tile templates like /{z}/{x}/{y}.pbf. String parsing keeps the
//   braces literal.
// - The /u/{host}/{path} passthrough mapping is a spike decision: it survives unknown
//   style variants (tm/lm/dm/hm/tf) without per-resource routes. Keep this
//   generic until the production proxy contract selects per-resource routes.

const VIETMAP_HOST_ALLOWLIST = new Set([
  "maps.vietmap.vn",
  "tiles.vietmap.vn",
  "api.vietmap.vn",
]);

const KEY_PARAM_NAMES = new Set(["apikey", "api_key", "key", "access_token"]);

const ABSOLUTE_URL_PATTERN = /^(https?):\/\/([^/?#]+)((?:\/[^?#]*)?)(\?[^#]*)?$/;

export type VietmapStyleRewriteResult = {
  style: Record<string, unknown>;
  rewrittenUrlCount: number;
  strippedKeyCount: number;
  untouchedExternalUrls: string[];
};

export function isAllowedVietmapHost(host: string): boolean {
  return VIETMAP_HOST_ALLOWLIST.has(host.toLowerCase());
}

export function containsCredentialMaterial(
  payload: string,
  apiKey: string,
): boolean {
  const decoded = decodePercentEncoding(payload);
  return decoded.includes(apiKey) || /apikey/i.test(decoded) ||
    /[?&](?:api_key|key|access_token)=/i.test(decoded);
}

function decodePercentEncoding(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = decoded.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function stripKeyParams(query: string | undefined): {
  query: string;
  stripped: number;
} {
  if (!query || query === "?") return { query: "", stripped: 0 };
  const pairs = query.slice(1).split("&").filter(Boolean);
  let stripped = 0;
  const kept = pairs.filter((pair) => {
    const rawName = pair.split("=")[0] ?? "";
    const name = decodePercentEncoding(rawName.replace(/\+/g, " "))
      .toLowerCase();
    if (KEY_PARAM_NAMES.has(name)) {
      stripped += 1;
      return false;
    }
    return true;
  });
  return { query: kept.length > 0 ? `?${kept.join("&")}` : "", stripped };
}

type SingleRewrite =
  | { kind: "rewritten"; url: string; stripped: number }
  | { kind: "external"; url: string }
  | { kind: "not-a-url" };

export function rewriteVietmapUrl(
  value: string,
  proxyBaseUrl: string,
): SingleRewrite {
  const match = ABSOLUTE_URL_PATTERN.exec(value);
  if (!match) return { kind: "not-a-url" };
  const host = match[2] ?? "";
  const path = match[3] ?? "";
  const { query, stripped } = stripKeyParams(match[4]);
  if (!isAllowedVietmapHost(host)) return { kind: "external", url: value };
  const base = proxyBaseUrl.endsWith("/")
    ? proxyBaseUrl.slice(0, -1)
    : proxyBaseUrl;
  return {
    kind: "rewritten",
    url: `${base}/u/${host.toLowerCase()}${path}${query}`,
    stripped,
  };
}

export function rewriteVietmapStyleJson(
  rawStyle: unknown,
  proxyBaseUrl: string,
): VietmapStyleRewriteResult {
  if (!isMapLibreV8Style(rawStyle)) {
    throw new TypeError("STYLE_RESPONSE_INVALID");
  }
  let rewrittenUrlCount = 0;
  let strippedKeyCount = 0;
  const untouchedExternalUrls: string[] = [];

  const rewriteString = (value: string): string => {
    const result = rewriteVietmapUrl(value, proxyBaseUrl);
    if (result.kind === "rewritten") {
      rewrittenUrlCount += 1;
      strippedKeyCount += result.stripped;
      return result.url;
    }
    if (result.kind === "external") {
      untouchedExternalUrls.push(result.url);
    }
    return value;
  };

  const style = structuredClone(rawStyle) as Record<string, unknown>;

  if (typeof style.glyphs === "string") style.glyphs = rewriteString(style.glyphs);
  if (typeof style.sprite === "string") style.sprite = rewriteString(style.sprite);

  const sources = style.sources;
  if (sources && typeof sources === "object" && !Array.isArray(sources)) {
    for (const source of Object.values(sources as Record<string, unknown>)) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const record = source as Record<string, unknown>;
      if (typeof record.url === "string") record.url = rewriteString(record.url);
      if (Array.isArray(record.tiles)) {
        record.tiles = record.tiles.map((tile) =>
          typeof tile === "string" ? rewriteString(tile) : tile
        );
      }
    }
  }

  return { style, rewrittenUrlCount, strippedKeyCount, untouchedExternalUrls };
}

function isMapLibreV8Style(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const style = value as Record<string, unknown>;
  return style.version === 8 &&
    Boolean(style.sources) &&
    typeof style.sources === "object" &&
    !Array.isArray(style.sources) &&
    Array.isArray(style.layers);
}

// Inverse mapping for the proxy passthrough route: /u/{host}/{path}?{query} -> upstream
// URL with the server-side key injected. Returns null when the host is not allowlisted
// or the path tries to escape (defense mirrors validateJobMediaPath's ".." rule).
export function buildUpstreamUrl(
  proxyPath: string,
  apiKey: string,
): string | null {
  const match = /^\/u\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/.exec(proxyPath);
  if (!match) return null;
  const host = (match[1] ?? "").toLowerCase();
  const path = match[2] ?? "/";
  const rawQuery = match[3] ?? "";
  if (!isAllowedVietmapHost(host)) return null;
  if (path.includes("..") || path.includes("//")) return null;
  const { query } = stripKeyParams(rawQuery);
  const joiner = query ? `${query}&` : "?";
  return `https://${host}${path}${joiner}apikey=${encodeURIComponent(apiKey)}`;
}
