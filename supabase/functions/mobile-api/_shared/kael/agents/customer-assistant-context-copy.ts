import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { inferAssistantServiceType } from "./customer-assistant-policy.ts";

export function customerExecutionLabel(
  language: KaelPromptLanguage,
  kind: "request" | "boundary" | "knowledge" | "summary",
) {
  const copy = language === "en"
    ? {
      boundary: "Support boundary",
      knowledge: "Related knowledge",
      request: "Request classification",
      summary: "Public response note",
    }
    : {
      boundary: "Giới hạn hỗ trợ",
      knowledge: "Thông tin liên quan",
      request: "Phân loại yêu cầu",
      summary: "Ghi chú phản hồi",
    };
  return copy[kind];
}

export function customerRequestScopeDetail(
  language: KaelPromptLanguage,
  serviceType: ReturnType<typeof inferAssistantServiceType>,
) {
  const service = serviceType ? customerServiceLabel(language, serviceType) : null;
  if (language === "en") {
    return service
      ? `The request was classified as ${service} support.`
      : "The request was classified as general Kael support.";
  }
  return service
    ? `Yêu cầu được nhận diện thuộc nhóm hỗ trợ ${service}.`
    : "Yêu cầu được nhận diện là hỗ trợ chung của Kael.";
}

export function customerBoundaryDetail(language: KaelPromptLanguage, allowed: boolean) {
  if (language === "en") {
    return allowed
      ? "The request is eligible for advisory support within current boundaries."
      : "The request needs a bounded safe response instead of general advisory support.";
  }
  return allowed
    ? "Yêu cầu phù hợp để nhận hỗ trợ tư vấn trong giới hạn hiện tại."
    : "Yêu cầu cần phản hồi an toàn có giới hạn thay vì tư vấn chung.";
}

export function customerKnowledgeDetail(language: KaelPromptLanguage, citationCount: number) {
  if (language === "en") {
    return citationCount > 0
      ? `Added ${citationCount} verified related knowledge source${citationCount === 1 ? "" : "s"}.`
      : "Added verified related platform context.";
  }
  return citationCount > 0
    ? `Đã bổ sung ${citationCount} nguồn thông tin liên quan đã được kiểm chứng.`
    : "Đã bổ sung ngữ cảnh nền tảng liên quan đã được kiểm chứng.";
}

function customerServiceLabel(
  language: KaelPromptLanguage,
  serviceType: NonNullable<ReturnType<typeof inferAssistantServiceType>>,
) {
  const copy = language === "en"
    ? {
      cleaning: "home cleaning",
      electrical: "electrical repair",
      handyman: "minor handyman work",
      hvac: "air-conditioner service",
      plumbing: "plumbing repair",
      upholstery: "upholstery care",
    }
    : {
      cleaning: "vệ sinh nhà",
      electrical: "sửa điện",
      handyman: "sửa vặt và lắp đặt nhỏ",
      hvac: "điều hòa",
      plumbing: "sửa nước",
      upholstery: "chăm sóc sofa, nệm, rèm hoặc thảm",
    };
  return copy[serviceType];
}
