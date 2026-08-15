import type { ServiceType } from "../contracts/types.ts";

export type ServiceReceiptCopy = {
  readonly possibleCondition: string;
  readonly noVisualUnknown: string;
  readonly includedComplexity: (complexity: string) => string;
  readonly scopeExcluded: string;
  readonly materialsExplanation: string;
  readonly replacementPartsExplanation: string | null;
  readonly equipmentExplanation: string | null;
  readonly fallbackRecommendedScope: string;
  readonly fallbackVisualUnavailable: string;
  readonly fallbackNoVisual: string;
};

export function serviceReceiptCopy(
  serviceType: ServiceType,
  language: "vi" | "en",
): ServiceReceiptCopy {
  return language === "en"
    ? ENGLISH_SERVICE_RECEIPT_COPY[serviceType]
    : VIETNAMESE_SERVICE_RECEIPT_COPY[serviceType];
}

const VIETNAMESE_SERVICE_RECEIPT_COPY: Record<ServiceType, ServiceReceiptCopy> = {
  electrical: {
    possibleCondition: "Điểm điện, thiết bị bảo vệ và phần dây phía sau vẫn cần được đối chiếu trực tiếp trước khi xác định nguyên nhân.",
    noVisualUnknown: "Chưa có ảnh để đối chiếu dấu hiệu tại điểm điện, thiết bị bảo vệ và phần dây bị che khuất.",
    includedComplexity: (complexity) => `Gói sửa điện hiện tại được tính theo mức độ phạm vi ${complexity}.`,
    scopeExcluded: "Chưa có số tách riêng cho linh kiện điện, vật tư hoặc phần dây ngoài mô tả.",
    materialsExplanation: "Vật tư điện chỉ được báo riêng khi hiện trạng xác nhận là cần và khách duyệt phạm vi mới.",
    replacementPartsExplanation: "Thiết bị hoặc linh kiện điện thay thế chưa được định giá khi chưa xác nhận hiện trạng.",
    equipmentExplanation: null,
    fallbackRecommendedScope: "Thợ cần kiểm tra điểm điện, thiết bị bảo vệ và phần dây liên quan trước khi chốt hạng mục sửa.",
    fallbackVisualUnavailable: "Kael đã nhận ảnh nhưng chưa xác nhận được dấu hiệu điện và phần dây bị che khuất; thợ cần kiểm tra trực tiếp.",
    fallbackNoVisual: "Chưa có ảnh để đối chiếu dấu hiệu tại điểm điện và phần dây bị che khuất.",
  },
  plumbing: {
    possibleCondition: "Nguồn rò, nghẹt hoặc lỗi kết nối cụ thể vẫn cần được đối chiếu tại thiết bị, ống và đường thoát liên quan.",
    noVisualUnknown: "Chưa có ảnh để đối chiếu nguồn rò/nghẹt, vật liệu ống và phần kết nối bị che khuất.",
    includedComplexity: (complexity) => `Gói sửa nước hiện tại được tính theo mức độ phạm vi ${complexity}.`,
    scopeExcluded: "Chưa có số tách riêng cho phụ kiện ống, vật tư hoặc phần đường ống ngoài mô tả.",
    materialsExplanation: "Vật tư nước chỉ được báo riêng khi hiện trạng xác nhận là cần và khách duyệt phạm vi mới.",
    replacementPartsExplanation: "Phụ kiện hoặc thiết bị nước thay thế chưa được định giá khi chưa xác nhận hiện trạng.",
    equipmentExplanation: null,
    fallbackRecommendedScope: "Thợ cần kiểm tra trực tiếp đúng thiết bị, khớp nối, đường ống hoặc đường thoát đã mô tả trước khi chốt cách xử lý.",
    fallbackVisualUnavailable: "Kael đã nhận ảnh nhưng chưa xác nhận được nguồn rò/nghẹt hoặc phần kết nối bị che khuất; thợ cần kiểm tra trực tiếp.",
    fallbackNoVisual: "Chưa có ảnh để đối chiếu nguồn rò/nghẹt, vật liệu và phần kết nối bị che khuất.",
  },
  cleaning: {
    possibleCondition: "Mức công và phương pháp vệ sinh còn phụ thuộc độ bám bẩn thực tế, bề mặt và khả năng tiếp cận từng khu vực.",
    noVisualUnknown: "Chưa có ảnh đại diện để đối chiếu mức bẩn, bề mặt và lối tiếp cận tại các khu vực ưu tiên.",
    includedComplexity: (complexity) => `Gói vệ sinh nhà hiện tại được tính theo mức độ phạm vi ${complexity}.`,
    scopeExcluded: "Chưa có số tách riêng cho hóa chất chuyên dụng, thiết bị đặc biệt hoặc khu vực ngoài mô tả.",
    materialsExplanation: "Hóa chất tiêu chuẩn nằm trong phạm vi gói khi nguồn giá không tách riêng; hóa chất chuyên dụng cần đề xuất mới và khách xác nhận.",
    replacementPartsExplanation: null,
    equipmentExplanation: "Thiết bị vệ sinh đặc biệt chưa được cộng vào giá; chỉ xem xét nếu hiện trạng cho thấy thực sự cần.",
    fallbackRecommendedScope: "Thợ cần đối chiếu mức bẩn, bề mặt và lối tiếp cận tại các khu vực đã xác nhận trước khi bắt đầu vệ sinh.",
    fallbackVisualUnavailable: "Kael đã nhận ảnh nhưng chưa xác nhận được mức bẩn và bề mặt đại diện; thợ cần đối chiếu trực tiếp trước khi vệ sinh.",
    fallbackNoVisual: "Chưa có ảnh đại diện để đối chiếu mức bẩn, bề mặt và lối tiếp cận tại các khu vực ưu tiên.",
  },
  hvac: {
    possibleCondition: "Mức bám bụi, tình trạng thoát nước và vận hành của từng thiết bị vẫn cần được đối chiếu trực tiếp.",
    noVisualUnknown: "Chưa có ảnh để đối chiếu loại máy, vị trí dàn lạnh/dàn nóng và dấu hiệu vận hành nhìn thấy được.",
    includedComplexity: (complexity) => `Gói điều hòa hiện tại được tính theo mức độ phạm vi ${complexity}.`,
    scopeExcluded: "Chưa có số tách riêng cho môi chất lạnh, linh kiện, thiết bị nâng hoặc phần sửa chữa ngoài mô tả.",
    materialsExplanation: "Vật tư và dung dịch chuyên dụng chỉ được báo riêng khi hiện trạng xác nhận là cần và khách duyệt phạm vi mới.",
    replacementPartsExplanation: "Linh kiện điều hòa hoặc phần môi chất lạnh chưa được định giá khi chưa xác nhận hiện trạng.",
    equipmentExplanation: "Thiết bị tiếp cận hoặc máy chuyên dụng chưa được cộng khi chưa xác nhận điều kiện thi công.",
    fallbackRecommendedScope: "Thợ cần đối chiếu loại máy, mức bám bụi, thoát nước, vận hành và điều kiện tiếp cận trước khi chốt cách xử lý.",
    fallbackVisualUnavailable: "Kael đã nhận ảnh nhưng chưa xác nhận được đầy đủ thiết bị và dấu hiệu vận hành; thợ cần kiểm tra trực tiếp.",
    fallbackNoVisual: "Chưa có ảnh để đối chiếu loại máy, vị trí lắp và dấu hiệu vận hành nhìn thấy được.",
  },
  upholstery: {
    possibleCondition: "Phương pháp xử lý còn phụ thuộc chất liệu, độ bền màu, tình trạng vết/mùi và điều kiện làm khô thực tế.",
    noVisualUnknown: "Chưa có ảnh để đối chiếu toàn bộ món đồ, chất liệu, nhãn chăm sóc và vùng vết/mùi cần xử lý.",
    includedComplexity: (complexity) => `Gói vệ sinh đồ vải/nội thất hiện tại được tính theo mức độ phạm vi ${complexity}.`,
    scopeExcluded: "Chưa có số tách riêng cho hóa chất chuyên dụng, xử lý phục hồi hoặc món đồ ngoài mô tả.",
    materialsExplanation: "Hóa chất tiêu chuẩn nằm trong phạm vi gói khi nguồn giá không tách riêng; xử lý chuyên dụng cần đề xuất mới và khách xác nhận.",
    replacementPartsExplanation: null,
    equipmentExplanation: "Thiết bị xử lý hoặc sấy đặc biệt chưa được cộng vào giá khi chưa xác nhận chất liệu và điều kiện làm khô.",
    fallbackRecommendedScope: "Thợ cần đối chiếu chất liệu, độ bền màu, vùng vết/mùi và điều kiện làm khô trước khi bắt đầu xử lý.",
    fallbackVisualUnavailable: "Kael đã nhận ảnh nhưng chưa xác nhận được đầy đủ chất liệu và vùng cần xử lý; thợ cần đối chiếu trực tiếp.",
    fallbackNoVisual: "Chưa có ảnh để đối chiếu toàn bộ món đồ, chất liệu, nhãn chăm sóc và vùng cần xử lý.",
  },
  handyman: {
    possibleCondition: "Tình trạng chi tiết, bề mặt lắp đặt, phụ kiện và đường điện/ống âm liên quan vẫn cần được đối chiếu trực tiếp.",
    noVisualUnknown: "Chưa có ảnh để đối chiếu vật cần sửa/lắp, bề mặt, kích thước và điều kiện tiếp cận.",
    includedComplexity: (complexity) => `Gói sửa vặt/lắp đặt hiện tại được tính theo mức độ phạm vi ${complexity}.`,
    scopeExcluded: "Chưa có số tách riêng cho phụ kiện, vật tư hoặc hạng mục lắp đặt ngoài mô tả.",
    materialsExplanation: "Vật tư lắp đặt chỉ được báo riêng khi hiện trạng xác nhận là cần và khách duyệt phạm vi mới.",
    replacementPartsExplanation: "Phụ kiện hoặc chi tiết thay thế chưa được định giá khi chưa xác nhận hiện trạng.",
    equipmentExplanation: "Dụng cụ tiếp cận đặc biệt chưa được cộng khi chưa xác nhận vị trí và bề mặt thi công.",
    fallbackRecommendedScope: "Thợ cần kiểm tra vật cần sửa/lắp, bề mặt, phụ kiện và khu vực thi công trước khi chốt cách xử lý.",
    fallbackVisualUnavailable: "Kael đã nhận ảnh nhưng chưa xác nhận được đầy đủ vật, bề mặt và phụ kiện; thợ cần kiểm tra trực tiếp.",
    fallbackNoVisual: "Chưa có ảnh để đối chiếu vật cần sửa/lắp, bề mặt, kích thước và điều kiện tiếp cận.",
  },
};

const ENGLISH_SERVICE_RECEIPT_COPY: Record<ServiceType, ServiceReceiptCopy> = {
  electrical: englishCopy("electrical point, protective device and concealed wiring", "electrical repair", "electrical parts or wiring"),
  plumbing: englishCopy("fixture, pipe, drain and concealed connection", "plumbing repair", "pipe fittings or plumbing parts"),
  cleaning: englishCareCopy("soil level, surfaces and access in each area", "home-cleaning", "specialist chemicals or equipment"),
  hvac: englishCopy("unit type, drainage, operation and access", "air-conditioning", "refrigerant, parts or access equipment"),
  upholstery: englishCareCopy("material, colorfastness, stain or odor and drying conditions", "upholstery-care", "specialist treatment or drying equipment"),
  handyman: englishCopy("item, mounting surface, hardware and concealed services", "handyman", "hardware, parts or access equipment"),
};

function englishCopy(subject: string, packageName: string, extras: string): ServiceReceiptCopy {
  return {
    possibleCondition: `The ${subject} still needs direct verification before the exact work is finalized.`,
    noVisualUnknown: `No representative image is available to verify the ${subject}.`,
    includedComplexity: (complexity) => `The current ${packageName} package is priced for ${complexity} complexity.`,
    scopeExcluded: `No separate amount is quoted for ${extras} outside the described scope.`,
    materialsExplanation: "Materials are quoted separately only when the observed condition requires them and the customer approves a new scope.",
    replacementPartsExplanation: "Replacement parts are not priced before the observed condition is confirmed.",
    equipmentExplanation: null,
    fallbackRecommendedScope: `The worker should inspect and verify the ${subject} before finalizing the work method.`,
    fallbackVisualUnavailable: `Kael received the image but could not fully verify the ${subject}; direct inspection is still required.`,
    fallbackNoVisual: `No representative image is available to verify the ${subject}.`,
  };
}

function englishCareCopy(subject: string, packageName: string, extras: string): ServiceReceiptCopy {
  return {
    ...englishCopy(subject, packageName, extras),
    materialsExplanation: "Standard consumables remain within the package when the source does not itemize them; specialist treatment requires a new approved scope.",
    replacementPartsExplanation: null,
    equipmentExplanation: "Specialist equipment is not added unless the observed condition shows it is needed.",
  };
}
