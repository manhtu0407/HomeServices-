#!/usr/bin/env node
// X4 F-17 smoke: a customer with an active (broadcasting) job must be able to
// resume it from the backend via GET /me/jobs/active after a "refresh".
//
// Flow: create disposable customer -> service-role INSERT a broadcasting job
// for them -> sign in as the customer -> GET /me/jobs/active -> assert the
// active_job matches -> cleanup. Uses service role only for fixture setup
// (allowed per QA charter: fixture + cleanup).

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function loadEnv() {
  try {
    const text = await readFile(path.join(REPO_ROOT, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([^=]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

const req = (n) => {
  const v = process.env[n];
  if (!v) throw new Error(`Missing env: ${n}`);
  return v;
};

function rest(supabaseUrl, serviceRoleKey) {
  return async (method, pathAndQuery, body) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "return=representation" : "return=minimal",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${pathAndQuery} -> ${res.status} ${text}`);
    try { return JSON.parse(text); } catch { return text; }
  };
}

async function main() {
  await loadEnv();
  const supabaseUrl = req("EXPO_PUBLIC_SUPABASE_URL");
  const apikey = req("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = req("SUPABASE_SERVICE_ROLE_KEY");
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ??
    `${supabaseUrl}/functions/v1/mobile-api`;
  const db = rest(supabaseUrl, serviceRoleKey);

  const runId = `x4-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const email = `${runId}@x4.staging.test`;
  const password = `Smoke!${runId}-Pw`;
  let userId = null;
  let jobId = null;
  let pass = false;

  try {
    // 1. Disposable customer
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: "customer", scenario: "x4-hydrate" } }),
    }).then((r) => r.json());
    userId = created?.id ?? created?.user?.id;
    if (!userId) throw new Error(`create user: ${JSON.stringify(created)}`);
    // profiles row is auto-created by the auth signup trigger; ensure role.
    await sleep(300);
    await db("PATCH", `profiles?id=eq.${userId}`, { role: "customer", full_name: "X4 hydrate smoke" });
    console.log(`[smoke] user_id=${userId}`);

    // 2. Service-role INSERT a broadcasting job for the customer.
    const jobRows = await db("POST", "jobs", {
      customer_id: userId,
      service_type: "plumbing",
      description: "X4 hydrate smoke broadcasting job — ong nuoc ro",
      problem_chips: ["pipe_leak"],
      photo_urls: [],
      address_district: "q1",
      status: "broadcasting",
      kael_problem_identified: "Ống nước rò",
      kael_complexity: "small",
      kael_price_min: 150000,
      kael_price_max: 300000,
    });
    jobId = Array.isArray(jobRows) ? jobRows[0]?.id : jobRows?.id;
    if (!jobId) throw new Error(`insert job: ${JSON.stringify(jobRows)}`);
    console.log(`[smoke] inserted broadcasting job_id=${jobId}`);

    // 3. Sign in as customer.
    await sleep(400);
    const signin = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());
    const accessToken = signin?.access_token;
    if (!accessToken) throw new Error(`signin: ${JSON.stringify(signin)}`);

    // 4. GET /me/jobs/active — the "after refresh" hydrate call.
    const res = await fetch(`${apiBaseUrl}/me/jobs/active`, {
      headers: { apikey, Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    const activeId = body?.active_job?.job?.id;
    const activeStatus = body?.active_job?.job?.status;
    pass = res.status === 200 && activeId === jobId && activeStatus === "broadcasting";
    console.log(`[smoke] GET /me/jobs/active -> status=${res.status} active_job.id=${activeId} active_job.status=${activeStatus}`);
    console.log(`[smoke] expect: 200 + id matches inserted job + status=broadcasting -> ${pass ? "PASS" : "FAIL"}`);
  } finally {
    if (jobId) { try { await db("DELETE", `jobs?id=eq.${jobId}`); } catch (e) { console.warn("job cleanup:", e.message); } }
    if (userId) {
      try {
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          method: "DELETE",
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        });
        console.log(`[smoke] cleaned up user ${userId}`);
      } catch (e) { console.warn("user cleanup:", e.message); }
    }
  }

  if (!pass) { console.error("[smoke] FAIL"); process.exit(1); }
  console.log("[smoke] PASS: F-17 customer active-job hydrate works on staging");
}

main().catch((e) => { console.error("[smoke] error:", e); process.exit(1); });
