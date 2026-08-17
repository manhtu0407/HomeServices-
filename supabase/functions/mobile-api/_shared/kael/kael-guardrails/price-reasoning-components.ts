import type { ServiceReceiptCopy } from "../language/service-receipt-copy.ts";
import type { PriceReasoningReceipt } from "./output-pipeline.ts";

export function buildPriceReasoningCosts(
  input: { priceMin: number; priceMax: number },
  isVietnamese: boolean,
  serviceCopy: ServiceReceiptCopy,
  replacementExcluded: boolean,
): PriceReasoningReceipt["costs"] {
  const conditionalComponents: PriceReasoningReceipt["costs"]["components"] = [
    {
      kind: "materials",
      status: "conditional_unpriced",
      amount_min: null,
      amount_max: null,
      explanation: serviceCopy.materialsExplanation,
    },
    ...(serviceCopy.replacementPartsExplanation
      ? [{
        kind: "replacement_parts" as const,
        status: replacementExcluded ? "excluded" as const : "conditional_unpriced" as const,
        amount_min: null,
        amount_max: null,
        explanation: replacementExcluded
          ? isVietnamese
            ? "Linh kiện thay thế đã được khách loại trừ khỏi phạm vi và không nằm trong khoảng giá này."
            : "Replacement parts were excluded by the customer and are not included in this price range."
          : serviceCopy.replacementPartsExplanation,
      }]
      : []),
    ...(serviceCopy.equipmentExplanation
      ? [{
        kind: "equipment" as const,
        status: "conditional_unpriced" as const,
        amount_min: null,
        amount_max: null,
        explanation: serviceCopy.equipmentExplanation,
      }]
      : []),
  ];
  return {
    currency: "VND",
    total_min: input.priceMin,
    total_max: input.priceMax,
    reconciliation: "package_total",
    components: [
      {
        kind: "service_package",
        status: "priced",
        amount_min: input.priceMin,
        amount_max: input.priceMax,
        explanation: isVietnamese
          ? "Khoảng giá đã chốt cho gói công việc trong phạm vi hiện có."
          : "The confirmed price range for the current work package.",
      },
      {
        kind: "labor",
        status: "included_unitemized",
        amount_min: null,
        amount_max: null,
        explanation: isVietnamese
          ? "Tiền công được thể hiện trong gói, nhưng hệ thống không có số tách riêng."
          : "Labor is represented in the package, but no separate amount is available.",
      },
      {
        kind: "travel",
        status: "undetermined",
        amount_min: null,
        amount_max: null,
        explanation: isVietnamese
          ? "Không có dữ liệu tách riêng cho di chuyển nên Kael không suy diễn thành một khoản giá."
          : "There is no separate travel amount, so Kael does not infer one.",
      },
      ...conditionalComponents,
    ],
  };
}

export function buildPriceReasoningScope(
  isVietnamese: boolean,
  serviceCopy: ServiceReceiptCopy,
  replacementUnconfirmed = false,
) {
  return {
    conditional: [
      ...(replacementUnconfirmed
        ? [
          isVietnamese
            ? "Chỉ thay linh kiện sau khi thợ gửi đề xuất đổi phạm vi và khách xác nhận."
            : "Replacement parts require a worker scope-change proposal and customer approval.",
        ]
        : []),
      isVietnamese
        ? "Nếu phát hiện hạng mục ngoài phạm vi, thợ phải gửi đề xuất đổi phạm vi để khách xác nhận trước khi làm."
        : "If work outside the scope is found, the worker must submit a scope-change proposal for customer approval first.",
    ],
    excluded: [serviceCopy.scopeExcluded],
    lowConditions: [
      isVietnamese
        ? "Phạm vi thực tế khớp với mô tả hiện có."
        : "The actual scope matches the current description.",
      isVietnamese
        ? "Không phát hiện hạng mục ngoài phạm vi cần khách duyệt."
        : "No out-of-scope work requiring customer approval is found.",
    ],
    highConditions: [
      isVietnamese
        ? "Cần nhiều thao tác hơn nhưng vẫn nằm trong phạm vi đã định giá."
        : "More work is needed, but it remains within the priced scope.",
      isVietnamese
        ? "Không tự cộng linh kiện hoặc hạng mục ngoài phạm vi chưa được khách xác nhận."
        : "Unapproved parts or out-of-scope work are not added automatically.",
    ],
  };
}
