import { pathToFileURL } from "node:url";

const ROOT = process.argv[2] ?? "C:/ns-fix/b4";
const SHARED = `${ROOT}/supabase/functions/mobile-api/_shared/`;
const load = (p) => import(pathToFileURL(SHARED + p).href);
const boundary = await load("kael/kael-guardrails/boundary-guard.ts");
const registry = await load("kael/learning/playbooks/registry.ts");

const ACTOR = "39800000-0000-4000-8000-000000000001";
const FLAGS_ON = Object.fromEntries(
  ["ELECTRICAL", "PLUMBING", "CLEANING", "HVAC", "UPHOLSTERY", "HANDYMAN"].map((n) => [`KAEL_PLAYBOOK_${n}_ENABLED`, "true"]),
);

function decide(flags, service, text, language) {
  globalThis.Deno = { env: { get: (k) => (flags === "on" ? FLAGS_ON : {})[k] } };
  const electricalPlaybookEnabled = Boolean(registry.getEnabledKaelPlaybook(service, ACTOR));
  const d = boundary.evaluateMessageBoundary(text, service, {
    actorId: ACTOR,
    semanticInjectionClassifierEnabled: true,
    language,
    electricalPlaybookEnabled,
  });
  return d.ok
    ? { declined: false, safety: [] }
    : { declined: true, reason: d.reason, signals: d.detectedSignals, safety: d.safetySignals ?? [], hasNumber: /11[2-5]/.test(d.declineText) };
}

const rows = [
  ["supported", "electrical", "vi", "Ổ cắm phòng khách bị lỏng, nhờ thợ sửa."],
  ["supported", "electrical", "vi", "Đèn phòng ngủ chập chờn, nhờ thợ kiểm tra."],
  ["supported", "electrical", "vi", "Nhờ thợ thay công tắc đèn hành lang."],
  ["supported", "electrical", "en", "The outlet in the living room is loose, please repair it."],
  ["supported-mention", "electrical", "vi", "Điện nhà mình lúc có lúc không, không biết do tủ điện hay do máy giặt, thợ trước nói một đằng giờ mình cũng rối."],
  ["supported-mention", "electrical", "vi", "Ổ cắm bếp bị lỏng, máy giặt và tủ lạnh vẫn chạy bình thường."],
  ["unsupported", "electrical", "vi", "Máy giặt nhà mình hỏng, nhờ thợ sửa."],
  ["unsupported", "electrical", "vi", "Tủ lạnh nhà mình không lạnh, nhờ thợ sửa."],
  ["unsupported", "electrical", "vi", "Nhờ thợ sửa tủ lạnh giúp mình."],
  ["unsupported", "electrical", "vi", "Nhờ thợ sửa máy giặt bị kẹt cửa."],
  ["unsupported", "electrical", "vi", "Wifi nhà mình chập chờn, nhờ thợ xem."],
  ["unsupported", "electrical", "vi", "Cần thợ sửa bếp từ không lên."],
  ["unsupported", "electrical", "vi", "Nhờ thợ sửa lò vi sóng."],
  ["unsupported", "electrical", "en", "Please fix my washing machine."],
  ["unsupported", "electrical", "en", "My fridge stopped cooling, please repair it."],
  ["unsupported", "electrical", "en", "Can someone repair the wifi router?"],
  ["mixed", "electrical", "vi", "Ổ cắm bếp bị lỏng và tủ lạnh cũng không lạnh, nhờ thợ sửa cả hai."],
  ["mixed", "electrical", "vi", "Công tắc đèn hỏng, tiện thể sửa luôn máy giặt giúp mình."],
  ["mixed", "electrical", "vi", "Nhờ thợ thay ổ cắm phòng ngủ và sửa tủ lạnh."],
  ["mixed", "electrical", "en", "Fix the loose outlet and also repair my washing machine."],
  ["mixed-safety", "electrical", "vi", "Ổ cắm bốc khói, tiện thể sửa luôn tủ lạnh nhà mình."],
  ["mixed-safety", "electrical", "en", "The outlet is sparking and I also need the fridge repaired."],
  ["unsupported-safety", "electrical", "vi", "Máy giặt bốc khói bên trong, nhờ thợ sửa."],
  ["unsupported-safety", "electrical", "vi", "Tủ lạnh nhà mình hỏng và có mùi khét."],
  ["plumbing-unsupported", "plumbing", "vi", "Nhờ thợ sửa máy giặt bị kẹt cửa."],
  ["handyman-unsupported", "handyman", "vi", "Tủ lạnh nhà mình không lạnh, nhờ thợ sửa."],
];

const out = rows.map(([kind, service, language, text]) => ({
  kind, service, language, text,
  off: decide("off", service, text, language),
  on: decide("on", service, text, language),
}));
for (const r of out) {
  const f = (d) => (d.declined ? `DECLINE:${d.reason}${d.safety.length ? `+safety(${d.safety.join("|")})` : ""}` : "ok");
  const flag = f(r.off) === f(r.on) ? "  " : "!!";
  console.log(`${flag} ${r.kind.padEnd(20)} ${r.service.padEnd(10)} off=${f(r.off).padEnd(40)} on=${f(r.on).padEnd(40)} ${r.text.slice(0, 70)}`);
}
console.log("DIFF", out.filter((r) => JSON.stringify([r.off.declined, r.off.reason]) !== JSON.stringify([r.on.declined, r.on.reason])).length, "of", out.length);
