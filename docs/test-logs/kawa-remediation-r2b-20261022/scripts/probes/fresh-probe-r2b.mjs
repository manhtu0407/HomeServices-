import { resolveReportedEmergencyGuidance } from "file:///C:/ns-fix/r1/supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts";
import { detectRequestedApplianceWork } from "file:///C:/ns-fix/r1/supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work.ts";

const spark = [
  ["R", "vi", "Em đang cố chặn tia lửa nhảy ra từ cái ổ cắm trong bếp."],
  ["R", "vi", "Cứu với, ổ cắm đang phóng tia lửa, tôi đang cố ngăn nó lại."],
  ["R", "vi", "Nhờ thợ qua ngăn giúp tia lửa xẹt ra từ cầu dao nhà mình."],
  ["R", "vi", "Tôi cố gắng chặn tia lửa bắn từ bảng điện mà không được."],
  ["R", "en", "Can you help me stop the sparks flying out of my breaker panel?"],
  ["R", "en", "I keep trying to stop sparks jumping from the wall socket."],
  ["R", "vi", "Mình đang tìm cách ngăn tia lửa phát ra từ ổ cắm."],
  ["R", "vi", "Công tắc phòng ngủ cứ bắn tia lửa, tôi chưa biết cách chống."],
  ["Q", "vi", "Mình muốn thay sang ổ cắm có khả năng chống tia lửa khi cắm bếp từ."],
  ["Q", "vi", "Báo giá cầu dao chống giật, chống tia lửa cho căn hộ 60m2."],
  ["Q", "en", "Do you stock a socket that stops sparks when plugging in a kettle?"],
  ["Q", "vi", "Tôi đang cân nhắc mua ổ cắm hạn chế tia lửa nhưng chưa biết hãng nào tốt."],
  ["Q", "vi", "Nhà mình đang dùng ổ cắm chống tia lửa, nhờ thợ lắp thêm hai cái."],
  ["Q", "en", "Please quote a breaker designed to stop sparks coming from loose plugs."],
  ["Q", "vi", "Ổ cắm hiện tại đang chống tia lửa khá tốt, chỉ cần thay mặt nạ."],
];
let sparkOk = 0;
for (const [want, language, text] of spark) {
  const got = resolveReportedEmergencyGuidance(text, language, { serviceType: "electrical" })?.route ?? null;
  const ok = want === "R" ? got === "electrical_water" : got === null;
  if (ok) sparkOk += 1;
  console.log(`${ok ? "ok  " : "MISS"} spark want=${want} got=${String(got)} :: ${text}`);
}
console.log(`spark ${sparkOk}/${spark.length}`);

const work = [
  ["Vòi sen đã lắp xong rồi, giờ mình cần thợ xem lại cái máy giặt.", ["may giat"]],
  ["Mình đã bảo trì xong ổ cắm và nhờ thợ kiểm tra máy giặt luôn.", ["may giat"]],
  ["Đã coi xong cái vòi nước rồi, còn máy sấy thì nhờ sửa giúp.", ["may say"]],
  ["Em vừa kiểm tra xong đường ống và cần anh xem giúp bếp từ.", ["bep tu"]],
  ["Mình mới sửa xong kệ giày rồi nên giờ cần sửa wifi nữa.", ["wifi"]],
  ["Lắp xong đèn rồi, internet thì mình nhờ kiểm tra luôn nhé.", ["internet"]],
  ["Mình đã sửa xong máy sấy rồi, giờ chỉ cần lắp rèm.", []],
  ["Thợ vừa kiểm tra xong tủ lạnh nên mình không cần xem thêm, chỉ nhờ thay bóng đèn.", []],
  ["Đã bảo trì wifi xong rồi và cần dọn nhà thôi.", []],
  ["Mình vừa sửa máy giặt xong rồi và nhờ lau cửa kính.", []],
  ["Bếp ga đã được lắp xong rồi, giờ nhờ kiểm tra ống nước.", []],
  ["Mình vừa lắp xong máy rửa bát rồi và cần xem hệ thống thoát nước.", []],
];
let workOk = 0;
for (const [text, want] of work) {
  const got = [...detectRequestedApplianceWork(text)];
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) workOk += 1;
  console.log(`${ok ? "ok  " : "MISS"} work want=${JSON.stringify(want)} got=${JSON.stringify(got)} :: ${text}`);
}
console.log(`work ${workOk}/${work.length}`);
