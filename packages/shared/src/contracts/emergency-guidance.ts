// Versioned route metadata carries no request text. Clients render only reviewed static copy.
import { z } from 'zod';

export const kaelEmergencyGuidanceSchema = z.object({
  version: z.literal('v1'),
  route: z.enum(['fire', 'medical', 'police', 'electrical_water', 'gas', 'uncertain']),
}).strict();

export type EmergencyGuidancePayload = z.infer<typeof kaelEmergencyGuidanceSchema>;

export function readKaelEmergencyGuidance(value: unknown): EmergencyGuidancePayload | null {
  const parsed = kaelEmergencyGuidanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const GUIDANCE: Record<EmergencyGuidancePayload['route'], { vi: string; en: string }> = {
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
  gas: {
    vi: "Có dấu hiệu rò rỉ gas (khí đốt). Không dùng lửa; không bật hoặc tắt công tắc, quạt hay thiết bị điện. Hãy rời khỏi khu vực, chỉ cảnh báo người xung quanh nếu an toàn, rồi gọi 114 từ nơi an toàn.",
    en: "There may be a fuel-gas leak. Do not use flames, and do not switch lights, fans or electrical devices on or off. Leave the area, alert others only if it is safe, and call 114 from a safe place.",
  },
  uncertain: {
    vi: "Nếu đang có tình huống khẩn cấp nhưng chưa rõ cần lực lượng nào, gọi 112 và mô tả ngắn gọn nguy cơ. Rời xa nguồn nguy hiểm nếu an toàn; làm theo hướng dẫn của tổng đài.",
    en: "If there is an emergency and you are unsure which service is needed, call 112 and briefly describe the danger. Move away if safe and follow the operator's instructions.",
  },
};

export function kaelEmergencyGuidanceCopy(route: EmergencyGuidancePayload['route'], language: 'vi' | 'en'): string {
  return GUIDANCE[route][language];
}
