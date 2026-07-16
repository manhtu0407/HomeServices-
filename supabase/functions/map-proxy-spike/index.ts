// §37 MP0 việc 2 — staging-only spike Edge function. NOT part of mobile-api; deploy it
// separately (`supabase functions deploy map-proxy-spike`) against STAGING to verify
// Option-1 (Edge style/tile proxy) end-to-end before MP1/MP2 touch real app code.
//
// Routes (all under /map-proxy-spike):
//   GET /style?style=tm|lm|dm|hm|tf  -> fetch VietMap style.json with the server-side
//        key, rewrite every tiles/glyphs/sprite URL to /u/{host}/{path}, strip ALL key
//        params, return the rewritten style. Payload MUST contain zero "apikey".
//   GET /u/{host}/{path}             -> allowlisted, byte-bounded passthrough;
//        injects the key server-side for tiles, glyphs, and sprites.
//
// Security: key only lives in Edge env (VIETMAP_API_KEY); host allowlist; bounded
// timeout (RULES.md #10); no PII in logs (only status codes + safe metadata).

import {
  buildUpstreamUrl,
  containsCredentialMaterial,
  rewriteVietmapStyleJson,
} from "./style-rewrite.ts";
import {
  fetchBufferedWithTimeout,
  readResponseJsonBounded,
  ResponseBodyTooLargeError,
} from "../_shared/network.ts";

const UPSTREAM_TIMEOUT_MS = 15_000;
const STYLE_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const ASSET_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const STYLE_VARIANTS = new Set(["tm", "lm", "dm", "hm", "tf"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  const apiKey = Deno.env.get("VIETMAP_API_KEY") ??
    Deno.env.get("VIETMAP_MAPS_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "MAP_PROXY_NOT_CONFIGURED" }, 503);
  }

  const url = new URL(request.url);
  // Same prefix normalization as mobile-api's normalizePath: the hosted gateway
  // serves /functions/v1/map-proxy-spike/..., local serve uses /map-proxy-spike/...
  const path = url.pathname
    .replace(/^\/functions\/v1\/map-proxy-spike(?=\/|$)/, "")
    .replace(/^\/map-proxy-spike(?=\/|$)/, "") || "/";

  if (request.method !== "GET") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (path === "/style") {
    const variant = url.searchParams.get("style") ?? "tm";
    if (!STYLE_VARIANTS.has(variant)) {
      return jsonResponse({ error: "UNKNOWN_STYLE_VARIANT" }, 400);
    }
    const upstream =
      `https://maps.vietmap.vn/maps/styles/${variant}/style.json?apikey=${
        encodeURIComponent(apiKey)
      }`;
    try {
      const response = await fetchBufferedWithTimeout(upstream, {
        redirect: "error",
        signal: request.signal,
      }, {
        maxResponseBytes: STYLE_MAX_RESPONSE_BYTES,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      });
      if (!response.ok) {
        console.warn("map-proxy-spike style upstream failed", {
          status: response.status,
          variant,
        });
        return jsonResponse({ error: "UPSTREAM_FAILED" }, 502);
      }
      const rawStyle = await readResponseJsonBounded(
        response,
        STYLE_MAX_RESPONSE_BYTES,
      );
      // Rewritten sub-resource URLs must be reachable by the CLIENT, so the base
      // mirrors however this request arrived (hosted gateway vs local serve).
      const proxyBase = url.pathname.startsWith("/functions/v1/")
        ? `${url.origin}/functions/v1/map-proxy-spike`
        : `${url.origin}/map-proxy-spike`;
      const result = rewriteVietmapStyleJson(rawStyle, proxyBase);
      const payload = JSON.stringify(result.style);
      // Hard gate G2: the rewritten payload must never contain key material.
      if (containsCredentialMaterial(payload, apiKey)) {
        console.error("map-proxy-spike rewrite leaked key material", {
          variant,
          rewrittenUrlCount: result.rewrittenUrlCount,
        });
        return jsonResponse({ error: "REWRITE_LEAK_BLOCKED" }, 500);
      }
      console.info("map-proxy-spike style served", {
        variant,
        rewrittenUrlCount: result.rewrittenUrlCount,
        strippedKeyCount: result.strippedKeyCount,
        untouchedExternalCount: result.untouchedExternalUrls.length,
      });
      return new Response(payload, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    } catch (error) {
      return upstreamFailureResponse(error);
    }
  }

  if (path.startsWith("/u/")) {
    const upstream = buildUpstreamUrl(`${path}${url.search}`, apiKey);
    if (!upstream) {
      return jsonResponse({ error: "UPSTREAM_NOT_ALLOWED" }, 403);
    }
    try {
      const response = await fetchBufferedWithTimeout(upstream, {
        redirect: "error",
        signal: request.signal,
      }, {
        maxResponseBytes: ASSET_MAX_RESPONSE_BYTES,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      });
      if (!response.ok) {
        console.warn("map-proxy-spike asset upstream failed", {
          status: response.status,
        });
        return jsonResponse({ error: "UPSTREAM_FAILED" }, 502);
      }
      const headers = new Headers();
      const contentType = response.headers.get("content-type");
      if (contentType) headers.set("content-type", contentType);
      const cacheControl = response.headers.get("cache-control");
      headers.set("cache-control", cacheControl ?? "public, max-age=86400");
      return new Response(response.body, { status: 200, headers });
    } catch (error) {
      return upstreamFailureResponse(error);
    }
  }

  return jsonResponse({ error: "NOT_FOUND" }, 404);
});

function upstreamFailureResponse(error: unknown): Response {
  if (error instanceof ResponseBodyTooLargeError) {
    return jsonResponse({ error: "UPSTREAM_TOO_LARGE" }, 502);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return jsonResponse({ error: "UPSTREAM_TIMEOUT" }, 504);
  }
  return jsonResponse({ error: "UPSTREAM_UNAVAILABLE" }, 502);
}
