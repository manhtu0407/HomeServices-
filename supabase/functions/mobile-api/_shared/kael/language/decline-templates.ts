export type EmpathyTemplateV2Key =
  | "price_concern"
  | "worker_concern"
  | "wait_time_concern"
  | "service_quality_concern"
  | "complaint_threat_acknowledge"
  | "refund_demand"
  | "pressure_acknowledge"
  | "repeated_demand";

export const EMPATHY_TEMPLATES_V2: Record<EmpathyTemplateV2Key, string> = {
  price_concern:
    "Kael hiểu bạn cần đảm bảo giá hợp lý. Đây là cơ sở Kael tính: {reasoning}. Mọi dữ liệu Kael dùng đều minh bạch.",
  worker_concern:
    "Kael hiểu bạn muốn yên tâm về thợ. {worker_summary} Mọi review đều được Kael ghi nhận và kiểm chứng.",
  wait_time_concern:
    "Xin lỗi vì thời gian chờ. Kael đã ghi nhận tiến trình thợ và sẽ cập nhật ngay.",
  service_quality_concern:
    "Kael ghi nhận mối lo của bạn. Mỗi tương tác được lưu lại đầy đủ. Nếu cần admin can thiệp, bạn có thể yêu cầu qua nút bên dưới.",
  complaint_threat_acknowledge:
    "Kael đã ghi nhận đầy đủ thông tin. Để vấn đề được giải quyết đúng cách, admin sẽ liên hệ bạn trong vòng 30 phút.",
  refund_demand:
    "Kael không có thẩm quyền quyết định hoàn tiền. Admin sẽ xem xét trường hợp của bạn dựa trên đầy đủ thông tin Kael đã ghi nhận từ giao dịch này.",
  pressure_acknowledge:
    "Kael ghi nhận yêu cầu của bạn. Quy trình của Kael minh bạch và mọi tương tác đều được lưu lại để đảm bảo công bằng cho cả khách và thợ.",
  repeated_demand:
    "Kael đã trả lời câu này. Nếu bạn vẫn cần giải thích thêm, admin có thể tham gia để giúp bạn hiểu rõ hơn.",
};

export function renderEmpathyTemplateV2(
  key: EmpathyTemplateV2Key,
  values: Record<string, string | number | null | undefined> = {},
) {
  return EMPATHY_TEMPLATES_V2[key].replace(/\{([a-z_]+)\}/g, (_, token: string) =>
    String(values[token] ?? "")
  );
}
