import type { KaelTopic } from "../kael-guardrails/permission-gate.ts";
import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { normalizeKaelResponseBrand } from "../language/user-facing-copy.ts";

const FALLBACK_VI =
  "Mình chưa xử lý trọn câu hỏi này. Bạn hãy nêu ngắn gọn hạng mục và dấu hiệu chính để mình kiểm tra lại.";
const FALLBACK_EN =
  "I could not fully process that question. Briefly describe the service and main symptom so I can check again.";
const LEGAL_NOTE_VI =
  "Kael chỉ cung cấp nhận biết an toàn/pháp lý chung, không thay thế tư vấn luật sư.";
const LEGAL_NOTE_EN =
  "Kael gives general safety/legal-awareness guidance only, not legal advice.";

export function fallbackText(language: KaelPromptLanguage, topic: KaelTopic) {
  if (language === "en") {
    if (topic === "electrical_repair" || topic === "electrical_safety_education") {
      return "Describe any heat, burning smell, or sparking from the electrical device. If danger is present, cut power only when safe and do not open the device.";
    }
    if (topic === "plumbing_repair" || topic === "plumbing_self_diagnosis") {
      return "Check where water appears and whether drainage is slowing, without opening hidden pipes. Shut the suitable valve and call a worker if leaking or overflow increases.";
    }
    if (topic === "hvac_service") {
      return "Turn the unit off first. Check the filter only if you know how to remove and refit it. If unsure, stop and call a worker.";
    }
    if (topic === "home_cleaning" || topic === "cleaning_best_practices") {
      return "Describe the surface, stain, and cleaning product already used. Avoid mixing chemicals, then test any safe product on a small hidden area.";
    }
    if (topic === "upholstery_care") {
      return "Describe the fabric, stain, moisture, and any product already used. Avoid soaking or scrubbing further until the material is identified.";
    }
    if (topic === "handyman_service") {
      return "Describe the item, loose or damaged point, and how it is mounted. Stop if the work may reach hidden wiring, plumbing, or a load-bearing part.";
    }
    if (topic === "service_pricing_general_info" || topic === "price_estimate") {
      return "A useful estimate needs the service, visible scope, location, and access conditions. Share those details so the price basis can be checked without inventing a quote.";
    }
    if (topic === "service_trust_safety") {
      return "Do not send an OTP, use an unknown payment link, or transfer a deposit outside the verified service flow. Pause and check the worker identity, agreed scope, and amount before continuing.";
    }
    return FALLBACK_EN;
  }
  if (topic === "electrical_repair" || topic === "electrical_safety_education") {
    return "Với thiết bị điện, hãy mô tả dấu hiệu nóng, mùi khét hoặc tia lửa. Nếu có nguy hiểm, ngắt nguồn khu vực đó khi an toàn và không tự tháo.";
  }
  if (topic === "plumbing_repair" || topic === "plumbing_self_diagnosis") {
    return "Hãy quan sát vị trí nước xuất hiện và tốc độ thoát mà không tháo đường ống. Khóa van phù hợp và gọi thợ nếu rò hoặc trào tăng.";
  }
  if (topic === "hvac_service") {
    return "Hãy tắt máy trước. Chỉ kiểm tra lưới lọc khi bạn biết cách mở và lắp lại. Nếu không chắc cách mở, hãy dừng và gọi thợ.";
  }
  if (topic === "home_cleaning" || topic === "cleaning_best_practices") {
    return "Hãy nêu bề mặt, loại vết bẩn và chất tẩy đã dùng. Không trộn hóa chất; chỉ thử sản phẩm an toàn ở vùng nhỏ khuất.";
  }
  if (topic === "upholstery_care") {
    return "Hãy nêu chất liệu, loại vết bẩn, độ ẩm và sản phẩm đã dùng. Không ngâm hoặc chà thêm khi chưa xác định đúng vật liệu.";
  }
  if (topic === "handyman_service") {
    return "Hãy mô tả vật dụng, điểm lỏng hoặc hỏng và cách nó được cố định. Dừng lại nếu có thể chạm dây điện, đường nước hoặc phần chịu lực.";
  }
  if (topic === "service_pricing_general_info" || topic === "price_estimate") {
    return "Khoảng giá cần hạng mục, phạm vi thấy được, khu vực và điều kiện tiếp cận. Hãy bổ sung các điểm này để kiểm tra cơ sở giá mà không đoán.";
  }
  if (topic === "service_trust_safety") {
    return "Không gửi OTP, mở đường dẫn thanh toán lạ hoặc chuyển cọc ngoài luồng dịch vụ đã xác minh. Hãy dừng lại và đối chiếu danh tính thợ, phạm vi cùng khoản tiền trước khi tiếp tục.";
  }
  return FALLBACK_VI;
}

export function deterministicSafetyNotes(
  language: KaelPromptLanguage,
  topic: KaelTopic,
) {
  if (topic === "legal_safety_awareness" || topic === "legal_advice") {
    return [language === "en" ? LEGAL_NOTE_EN : LEGAL_NOTE_VI]
      .map(normalizeKaelResponseBrand);
  }
  return [];
}
