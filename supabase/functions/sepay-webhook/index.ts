import { createClient } from "@supabase/supabase-js";
import { readEdgeEnv } from "../mobile-api/_shared/env.ts";
import {
  receiveSePayVietQrWebhook,
  SePayWebhookFailure,
} from "../mobile-api/_shared/services/sepay-vietqr-payment.service.ts";
import {
  readJsonTextRequestBounded,
  RequestJsonError,
} from "../_shared/request-json.ts";

const MAX_JSON_BODY_BYTES = 16 * 1024;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ success: false }, 405);

  let rawBody: string;
  try {
    rawBody = await readJsonTextRequestBounded(request, MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestJsonError) return json({ success: false }, error.status);
    return json({ success: false }, 400);
  }

  let env;
  try {
    env = readEdgeEnv((name) => Deno.env.get(name) ?? undefined);
  } catch {
    return json({ success: false }, 503);
  }
  const client = createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await receiveSePayVietQrWebhook(client, env.sepayVietQr, {
      rawBody,
      signature: request.headers.get("x-sepay-signature"),
      timestamp: request.headers.get("x-sepay-timestamp"),
    });
    return json({ success: true });
  } catch (error) {
    if (error instanceof SePayWebhookFailure) {
      return json({ success: false }, error.status);
    }
    console.error("sepay webhook failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ success: false }, 500);
  }
});

function json(body: { success: boolean }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
