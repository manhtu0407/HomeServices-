import { canonicalizeVN } from "../language/canonicalize-vn.ts";

export type EmergencyRoute = "fire" | "medical" | "police" | "electrical_water" | "uncertain";

export type EmergencyGuidance = {
  route: EmergencyRoute;
  response: string;
};

const EMERGENCY_CUES: Record<Exclude<EmergencyRoute, "uncertain">, readonly RegExp[]> = {
  fire: [
    /\b(?:boc khoi|phat khoi|dang co khoi|co khoi|dang boc chay|dang chay|nha dang chay|nha chay|co chay|chay o cam|chay o dien|co lua|lua dang chay)\b/u,
    /\b(?:there (?:is|s) smoke|smoke is coming|(?:outlet|socket|wire|device|appliance|panel|house|building) is smoking|on fire|fire started|flames? coming)\b/u,
  ],
  medical: [
    /\b(?:dien giat|bi dien giat|bat tinh|ngat xiu|chay mau|bi thuong|kho tho|dau nguc|cap cuu)\b/u,
    /\b(?:electric shock|unconscious|bleeding|injured|i m hurt|someone is hurt|person is hurt|seriously hurt|badly hurt|cannot breathe|can t breathe|shortness of breath|chest pain|medical emergency)\b/u,
  ],
  police: [
    /\b(?:dot nhap|co nguoi dot nhap|dang bi tan cong|bi tan cong|bi de doa|dang bi de doa|bi cuop|dang bi cuop|bao luc)\b/u,
    /\b(?:intruder|breaking in|break in|being attacked|being threatened|robbery in progress|assault in progress)\b/u,
  ],
  electrical_water: [
    /\b(?:tia lua dien|phat tia lua|o dien (?:co )?(?:tia lua|phat tia lua)|day dien lo|day dien tran|day dien dang co dien|day dien phat tia lua)\b/u,
    /\b(?:nuoc (?:dang )?ngap (?:gan|quanh) (?:o dien|o cam|nguon dien|day dien)|nuoc gan (?:o dien|o cam|day dien)|nuoc dang cham vao o dien|nuoc cham vao day dien)\b/u,
    /\b(?:electrical sparking|(?:outlet|socket|wire|panel|breaker) is sparking|sparking (?:from|at) (?:an? )?(?:outlet|socket|wire)|exposed live wire|live wire exposed|water near live wire|water touching an outlet|water near (?:an? )?(?:outlet|electricity|electrical equipment)|water (?:is )?(?:rising|flooding) near (?:an? )?(?:outlet|electricity)|electrical flooding|flooding near electricity|electrical hazard)\b/u,
  ],
};

const UNCERTAIN_EMERGENCY_CUES = [
  /\b(?:dang gap nguy hiem|gap nguy hiem|khong ro goi ai|khong biet goi ai|khong biet goi so nao|tinh huong khan cap|can ho tro khan cap|khong chac goi so nao|khong chac day co phai tinh huong khan cap|khong biet day co phai nguy hiem khong)\b/u,
  /\b(?:emergency help|urgent emergency|don t know who to call|not sure who to call|which emergency number|unsure which emergency service|not sure if this is an emergency)\b/u,
];
const NEGATED_CUE_SUFFIX = /\b(?:khong|chua|het|no|not|never|without|no longer|does not|do not|is not|are not|was not|were not|doesn t|don t|isn t|aren t)\b(?:\s+[\p{L}\p{N}]+){0,4}\s*$/u;

const GUIDANCE: Record<EmergencyRoute, { vi: string; en: string }> = {
  fire: {
    vi: "Có dấu hiệu khói hoặc lửa đang diễn ra. Hãy rời khỏi khu vực; chỉ cảnh báo người xung quanh nếu an toàn. Gọi 114 và không chạm vào thiết bị hoặc ổ điện.",
    en: "There may be active smoke or fire. Leave the area, alert others only if safe, and call 114. Do not touch the equipment or outlet.",
  },
  medical: {
    vi: "Có người cần cấp cứu y tế. Gọi 115 và làm theo hướng dẫn của tổng đài. Chỉ di chuyển người đó ra xa nguy hiểm nếu việc đó an toàn.",
    en: "Someone may need emergency medical care. Call 115 and follow the operator's instructions. Move them away from danger only if it is safe.",
  },
  police: {
    vi: "Nếu đang bị đe dọa hoặc có người đột nhập, hãy tìm nơi an toàn và gọi công an 113. Không đối đầu; làm theo hướng dẫn của tổng đài.",
    en: "If someone is threatening you or breaking in, get to a safe place and call police at 113. Do not confront them; follow the operator's instructions.",
  },
  electrical_water: {
    vi: "Không chạm vào dây điện, ổ điện, thiết bị hoặc nước gần nguồn điện. Tránh xa và giữ người khác tránh xa; không tự ngắt điện nếu phải đi tới khu vực nguy hiểm. Nếu có khói hoặc lửa, gọi 114; nếu có người bị điện giật hoặc bị thương, gọi 115. Nếu nguy cơ khẩn cấp chưa rõ, gọi 112.",
    en: "Do not touch wiring, outlets, equipment, or water near electricity. Stay back and keep others away; do not approach a breaker if that is unsafe. Call 114 for smoke or fire, 115 for electric shock or injury, and 112 if the immediate emergency response is unclear.",
  },
  uncertain: {
    vi: "Nếu đang có tình huống khẩn cấp nhưng chưa rõ cần lực lượng nào, gọi 112 và mô tả ngắn gọn nguy cơ. Rời xa nguồn nguy hiểm nếu an toàn; làm theo hướng dẫn của tổng đài.",
    en: "If there is an emergency and you are unsure which service is needed, call 112 and briefly describe the danger. Move away if safe and follow the operator's instructions.",
  },
};

export function resolveEmergencyGuidance(
  text: string,
  language: "vi" | "en",
): EmergencyGuidance | null {
  const normalized = canonicalizeVN(text).replace(/[’']/g, " ");
  const routes = (Object.keys(EMERGENCY_CUES) as Array<Exclude<EmergencyRoute, "uncertain">>)
    .filter((route) => EMERGENCY_CUES[route].some((cue) => hasAffirmedCue(normalized, cue)));

  let route: EmergencyRoute | null = null;
  if (routes.length > 1) {
    route = "uncertain";
  } else if (routes.length === 1) {
    route = routes[0] ?? null;
  } else if (UNCERTAIN_EMERGENCY_CUES.some((cue) => hasAffirmedCue(normalized, cue))) {
    route = "uncertain";
  }

  return route ? { route, response: GUIDANCE[route][language] } : null;
}

function hasAffirmedCue(text: string, cue: RegExp): boolean {
  const globalCue = new RegExp(cue.source, "gu");
  for (const match of text.matchAll(globalCue)) {
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 48), index);
    if (!NEGATED_CUE_SUFFIX.test(prefix)) return true;
  }
  return false;
}
