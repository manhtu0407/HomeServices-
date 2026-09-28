// The only reader of IDENTITY_HMAC_KEY. CCCD numbers, phones and emails are turned into keyed digests
// here and nowhere else, so neither the raw numbers nor the key ever reach the database.

import { apiFailure } from "../../platform/api-failure.ts";

function identityKey(): string {
  const get = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  const key = get?.("IDENTITY_HMAC_KEY");
  if (!key || key.length < 32) {
    apiFailure("IDENTITY_KEY_UNAVAILABLE", "Hệ thống xác minh danh tính chưa sẵn sàng", 503);
  }
  return key;
}

async function hmacHex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(identityKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cccdDigest(cccdNumber: string): Promise<string> {
  return hmacHex(`cccd:${cccdNumber}`);
}

// +84 912 345 678 and 0912345678 are the same subscriber; both must produce one digest.
export function normalizeVietnamPhone(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("84") && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
  return /^0[0-9]{9,10}$/.test(local) ? local : null;
}

// Gmail ignores dots and anything after "+" in the local part, and googlemail.com is the same
// mailbox, so every spelling of one Gmail account folds to one digest. Other providers only
// have case and surrounding spaces folded, since their local parts can be significant.
export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  let local = trimmed.slice(0, at);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0]?.replaceAll(".", "") ?? "";
    return local ? `${local}@gmail.com` : null;
  }
  return `${local}@${domain}`;
}

export async function emailDigest(email: string | null): Promise<string | null> {
  const normalized = email ? normalizeEmail(email) : null;
  return normalized ? hmacHex(`email:${normalized}`) : null;
}

export async function phoneDigest(phone: string | null): Promise<string | null> {
  const normalized = phone ? normalizeVietnamPhone(phone) : null;
  return normalized ? hmacHex(`phone:${normalized}`) : null;
}
