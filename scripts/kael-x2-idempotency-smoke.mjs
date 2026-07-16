#!/usr/bin/env node
// X2 idempotency + rate-limit smoke against staging mobile-api.
//
// Cases:
//   1. 5x parallel POST /kael/chat with the same client_request_id ->
//      exactly 1 session row created.
//   2. 5x parallel POST /jobs with the same client_request_id ->
//      exactly 1 job row created.
//   3. 10x serial POST /kael/chat after the idempotency case ->
//      the shared per-user budget yields at least one RATE_LIMITED response.

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import {
  assertStagingOrLocalTargets,
  assertSupabaseCredentials,
  fetchWithTimeout,
} from "./lib/staging-smoke-safety.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function loadEnv() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  try {
    const text = await readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (!match) continue;
      const name = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[name]) process.env[name] = value;
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function adminCreateUser(supabaseUrl, serviceRoleKey, email, password) {
  const url = `${supabaseUrl}/auth/v1/admin/users`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "customer", scenario: "x2-idempotency-smoke" },
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`adminCreateUser failed with HTTP ${response.status}`);
  }
  return JSON.parse(body);
}

async function adminDeleteUser(supabaseUrl, serviceRoleKey, userId) {
  const url = `${supabaseUrl}/auth/v1/admin/users/${userId}`;
  const response = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`adminDeleteUser failed with HTTP ${response.status}`);
  }
}

async function signIn(supabaseUrl, apikey, email, password) {
  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { apikey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`signIn failed with HTTP ${response.status}`);
  }
  const data = JSON.parse(body);
  if (!data?.access_token) {
    throw new Error("signIn returned no access_token");
  }
  return data.access_token;
}

function postJson(url, apikey, accessToken, payload) {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: {
      apikey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw */
    }
    return { status: response.status, body: parsed ?? text };
  });
}

async function caseIdempotentKaelChat(apiBaseUrl, apikey, accessToken) {
  console.log("\n[smoke] Case 1: 5x parallel POST /kael/chat same client_request_id");
  const requestId = crypto.randomUUID();
  const payload = {
    service_type: "plumbing",
    message: "Ống nước rò dưới lavabo nhà bếp đã 2 ngày",
    problem_chips: [],
    photo_urls: [],
    address_label: "Quận 1, TP. Hồ Chí Minh",
    address_district: "q1",
    client_request_id: requestId,
  };
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      postJson(`${apiBaseUrl}/kael/chat`, apikey, accessToken, payload)),
  );
  const sessionIds = new Set();
  for (const r of results) {
    const id = r.body?.session?.id;
    if (id) sessionIds.add(id);
  }
  const okCount = results.filter((r) => r.status === 201 || r.status === 200).length;
  const pass = sessionIds.size === 1 && okCount === 5;
  console.log(
    `  status_codes=${results.map((r) => r.status).join(",")} unique_session_ids=${sessionIds.size}`,
  );
  console.log(`  expect: unique_session_ids=1 AND all_2xx -> ${pass ? "PASS" : "FAIL"}`);
  return { name: "idempotent_kael_chat", pass, sessionId: [...sessionIds][0] ?? null };
}

async function caseIdempotentJob(apiBaseUrl, apikey, accessToken) {
  console.log("\n[smoke] Case 2: 5x parallel POST /jobs same client_request_id");
  const requestId = crypto.randomUUID();
  const payload = {
    service_type: "electrical",
    description: "Cầu dao trip liên tục mỗi lần bật bình nóng lạnh phòng tắm",
    problem_chips: ["Cầu dao trip"],
    photo_urls: [],
    address_building: "Toà nhà Q1",
    address_district: "q1",
    client_request_id: requestId,
  };
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      postJson(`${apiBaseUrl}/jobs`, apikey, accessToken, payload)),
  );
  // Job creation triggers AI pipeline; without provider keys this may return
  // AI_FAILED 502 for some attempts. The idempotency invariant we check is:
  // all SUCCESSFUL attempts share the same job_id.
  const okCount = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const okJobIds = results
    .filter((r) => r.status >= 200 && r.status < 300)
    .map((r) => r.body?.job_id)
    .filter(Boolean);
  const uniqueOkIds = new Set(okJobIds);
  const pass = okCount >= 1 && uniqueOkIds.size === 1;
  console.log(
    `  status_codes=${results.map((r) => r.status).join(",")} ok_count=${okCount} unique_ok_job_ids=${uniqueOkIds.size}`,
  );
  console.log(`  expect: at least one success and exactly one successful job id -> ${pass ? "PASS" : "FAIL"}`);
  return { name: "idempotent_job", pass, jobId: [...uniqueOkIds][0] ?? null };
}

async function caseRateLimit(apiBaseUrl, apikey, accessToken) {
  console.log("\n[smoke] Case 3: 10x serial POST /kael/chat against the remaining per-user budget");
  const results = [];
  for (let i = 0; i < 10; i++) {
    const payload = {
      service_type: "cleaning",
      message: `Tổng vệ sinh căn hộ. yêu cầu ${i}`,
      problem_chips: [],
      photo_urls: [],
      address_label: "Quận 1, TP. Hồ Chí Minh",
      address_district: "q1",
      client_request_id: crypto.randomUUID(),
    };
    const result = await postJson(
      `${apiBaseUrl}/kael/chat`,
      apikey,
      accessToken,
      payload,
    );
    results.push(result.status);
  }
  const successCount = results.filter((s) => s >= 200 && s < 300).length;
  const rateLimitedCount = results.filter((s) => s === 429).length;
  // We expect AT MOST 5 successes (per-minute cap) and at LEAST 1 rate-limited.
  const pass = successCount <= 5 && rateLimitedCount >= 1;
  console.log(
    `  status_codes=${results.join(",")} success=${successCount} rate_limited=${rateLimitedCount}`,
  );
  console.log(
    `  expect: success <= 5 AND rate_limited >= 1 -> ${pass ? "PASS" : "FAIL"}`,
  );
  return { name: "rate_limit_kael_chat", pass };
}

async function main() {
  await loadEnv();
  const supabaseUrl = requireEnv("EXPO_PUBLIC_SUPABASE_URL");
  const apikey = requireEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertSupabaseCredentials(apikey, serviceRoleKey);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ??
    `${supabaseUrl}/functions/v1/mobile-api`;
  assertStagingOrLocalTargets("KAEL_X2_RUN_LIVE", supabaseUrl, apiBaseUrl);

  const runId = `x2-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const email = `${runId}@x2.staging.test`;
  const password = `Smoke!${runId}-Pw`;

  console.log(`[smoke] run_id=${runId} apiBaseUrl=${apiBaseUrl}`);

  let userId = null;
  let summary = [];
  let allPass = true;
  let cleanupFailed = false;
  const keepUser = process.env.KEEP_USER === "yes";

  try {
    const user = await adminCreateUser(
      supabaseUrl,
      serviceRoleKey,
      email,
      password,
    );
    userId = user?.id ?? user?.user?.id;
    if (!userId) throw new Error(`No user id: ${JSON.stringify(user)}`);
    console.log(`[smoke] user_id=${userId}`);

    await sleep(500);
    const accessToken = await signIn(supabaseUrl, apikey, email, password);
    console.log(`[smoke] signed in, JWT length=${accessToken.length}`);

    summary.push(await caseIdempotentKaelChat(apiBaseUrl, apikey, accessToken));
    summary.push(await caseIdempotentJob(apiBaseUrl, apikey, accessToken));
    summary.push(await caseRateLimit(apiBaseUrl, apikey, accessToken));

    for (const result of summary) if (!result.pass) allPass = false;
  } finally {
    if (userId && !keepUser) {
      try {
        await adminDeleteUser(supabaseUrl, serviceRoleKey, userId);
        console.log(`[smoke] cleaned up user ${userId}`);
      } catch (err) {
        cleanupFailed = true;
        console.error(`[smoke] cleanup failed: ${err.message}`);
      }
    } else if (userId) {
      console.log(`[smoke] KEEP_USER=yes, retained user ${userId}`);
    }
  }

  if (cleanupFailed) allPass = false;

  console.log("\n[smoke] === summary ===");
  console.log(JSON.stringify(summary, null, 2));
  if (!allPass) {
    console.error("\n[smoke] FAIL: one or more cases did not match expectation");
    process.exit(1);
  }
  console.log("\n[smoke] PASS: idempotency + rate-limit verified");
}

main().catch((err) => {
  console.error("[smoke] error:", err);
  process.exit(1);
});
