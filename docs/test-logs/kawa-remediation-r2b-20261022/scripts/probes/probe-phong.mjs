const root = process.argv[2];
const { resolveReportedEmergencyGuidance } = await import(`file:///${root}/supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts`);
const rows = [
  "Ổ cắm đang phóng tia lửa, nóng rát tay.",
  "Công tắc phóng tia lửa mỗi lần bật.",
  "O cam dang phong tia lua, nong rat tay.",
  "Ổ cắm phóng tia lửa điện ra ngoài.",
  "Nhờ lắp ổ cắm phòng tia lửa cho bếp.",
  "Nhờ lắp ổ cắm phòng ngừa tia lửa cho bếp.",
];
for (const text of rows) console.log(JSON.stringify(resolveReportedEmergencyGuidance(text, "vi", { serviceType: "electrical" })?.route ?? null), text);
