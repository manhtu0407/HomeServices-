import { resolveEmergencyGuidance } from "file:///C:/ns-fix/r1/supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts";
import { detectRequestedApplianceWork } from "file:///C:/ns-fix/r1/supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work.ts";

const sparks = [
  "Tôi đang cố ngăn tia lửa điện bắn ra từ ổ cắm.",
  "Tôi đang cố chặn tia lửa từ ổ cắm.",
  "Tôi không thể ngăn tia lửa điện bắn ra từ ổ cắm.",
  "I am trying to stop sparks coming out of the outlet.",
  "Nhờ lắp ổ cắm chống tia lửa cho bếp.",
  "Please replace the spark-proof outlet cover.",
];
for (const text of sparks) console.log("spark", JSON.stringify(resolveEmergencyGuidance(text, "vi")?.route ?? null), text);

const works = [
  "Mình đã sửa xong vòi nước rồi và cần sửa máy giặt.",
  "Mình đã sửa xong vòi nước rồi, cần sửa máy giặt.",
  "Mình đã sửa xong máy giặt rồi.",
  "Đã sửa xong tủ lạnh rồi và cần sửa máy giặt.",
  "Thợ đã kiểm tra xong ổ cắm rồi nhưng cần xem lại máy giặt.",
  "Mình đã sửa máy giặt xong rồi.",
];
for (const text of works) console.log("work", JSON.stringify([...detectRequestedApplianceWork(text)]), text);
