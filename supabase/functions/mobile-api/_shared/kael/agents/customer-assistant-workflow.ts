import type { CustomerAssistantSuggestedAction } from "./customer-assistant-provider-output.ts";
import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";

export type CustomerAssistantWorkflowResolution = {
  readonly answer: string;
  readonly suggestedActions: readonly CustomerAssistantSuggestedAction[];
};

export function resolveCustomerAssistantWorkflowAnswer(input: {
  readonly jobStatus?: string | null;
  readonly paymentRailAvailable?: boolean;
  readonly paymentStatus?: string | null;
  readonly question: string;
  readonly language: KaelPromptLanguage;
}): CustomerAssistantWorkflowResolution | null {
  const paymentRailAvailable = input.paymentRailAvailable ?? Boolean(input.paymentStatus);
  if (isCustomerScopeAutonomyRequest(input.question)) {
    return {
      answer: customerScopeAutonomyMessage(input.language),
      suggestedActions: ["request_scope_change"],
    };
  }

  if (isCustomerScopeChatApprovalRequest(input.question)) {
    return {
      answer: customerScopeChatApprovalMessage(input.language),
      suggestedActions: ["request_scope_change"],
    };
  }

  if (input.jobStatus === "arrived" && isCustomerPreCheckInAccessRequest(input.question)) {
    return { answer: customerArrivedApartmentAccessGateMessage(input.language), suggestedActions: [] };
  }

  if (input.jobStatus === "arrived" && isCustomerCheckInBypassRequest(input.question)) {
    return { answer: customerArrivedCheckInGateMessage(input.language), suggestedActions: [] };
  }

  if (
    input.jobStatus === "confirmed_by_customer" &&
    !paymentRailAvailable &&
    isCustomerPaymentQuestion(input.question)
  ) {
    return { answer: customerPaymentUnavailableMessage(input.language), suggestedActions: [] };
  }

  if (input.jobStatus && isCustomerWorkflowStatusQuestion(input.question)) {
    return {
      answer: customerWorkflowStatusMessage(
        input.jobStatus,
        input.language,
        paymentRailAvailable,
      ),
      suggestedActions: [],
    };
  }

  return null;
}

export function customerWorkflowStatusLabel(status: string, language: KaelPromptLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    awaiting_customer_confirm: ["Chờ bạn xác nhận", "Awaiting your confirmation"],
    broadcasting: ["Đang tìm thợ", "Finding a worker"],
    worker_candidate_pending: ["Đang chờ xác nhận thợ", "Awaiting worker confirmation"],
    worker_matched: ["Đã có thợ nhận việc", "Worker matched"],
    worker_on_way: ["Thợ đang trên đường", "Worker on the way"],
    arrived: ["Thợ đã đến nơi", "Worker has arrived"],
    inspecting: ["Thợ đang kiểm tra", "Worker is inspecting"],
    repairing: ["Đang thực hiện công việc", "Work in progress"],
    scope_change_pending: ["Chờ bạn xem thay đổi phạm vi", "Awaiting scope-change review"],
    completed_by_worker: ["Thợ đã báo hoàn thành", "Worker reported completion"],
    confirmed_by_customer: ["Bạn đã xác nhận hoàn thành", "Completion confirmed"],
    payment_pending: ["Chờ thanh toán", "Awaiting payment"],
    paid: ["Đã thanh toán", "Paid"],
  };
  const label = labels[status];
  if (!label) return language === "en" ? "Job in progress" : "Công việc đang tiếp tục";
  return language === "en" ? label[1] : label[0];
}

function customerScopeAutonomyMessage(language: KaelPromptLanguage) {
  return language === "en"
    ? "No. Kael cannot change the price or add or replace work items on its own. If the worker finds additional work, they must submit a scope-change proposal with evidence; Kael will show it for your separate confirmation in the app."
    : "Không. Kael không thể tự thay đổi giá hoặc thêm hay thay hạng mục công việc. Nếu thợ phát hiện cần làm thêm, thợ phải gửi đề xuất thay đổi phạm vi kèm bằng chứng; Kael sẽ hiển thị để bạn xác nhận riêng trong ứng dụng.";
}

function customerScopeChatApprovalMessage(language: KaelPromptLanguage) {
  return language === "en"
    ? "Not yet. Agreeing in chat does not change the scope or price. The worker must submit an official scope-change proposal with a reason and any available evidence; Kael recalculates the proposal for you to review, then you confirm it or keep the original scope in the app. No extra work starts before that confirmation."
    : "Chưa. Đồng ý trong chat không làm thay đổi phạm vi hoặc giá. Thợ phải gửi đề xuất đổi phạm vi chính thức kèm lý do và bằng chứng nếu có; Kael tính lại đề xuất để bạn xem, rồi bạn xác nhận hoặc giữ phạm vi cũ trong ứng dụng. Không làm phần phát sinh trước khi có xác nhận đó.";
}

function isCustomerScopeAutonomyRequest(text: string) {
  const normalized = normalizeWorkflowText(text);
  const autonomySignal = /\b(?:tu (?:dong|them|tang|thay|duyet|quyet dinh)|khong can (?:hoi|xac nhan|dong y)|bo qua (?:xac nhan|dong y)|khong hoi (?:lai )?(?:toi|ban|khach hang)|without (?:asking|confirmation|approval)|auto(?:matically)? (?:add|increase|change|replace|approve))\b/;
  return autonomySignal.test(normalized) && hasCustomerScopeOrPriceSignal(normalized);
}

function isCustomerScopeChatApprovalRequest(text: string) {
  const normalized = normalizeWorkflowText(text);
  const chatSignal = /\b(?:trong chat|qua chat|nhan tin|tro chuyen|in chat|via chat|message)\b/;
  const approvalSignal = /\b(?:dong y|xac nhan|duoc chua|co duoc|ok)\b/;
  return hasCustomerScopeOrPriceSignal(normalized) && chatSignal.test(normalized) && approvalSignal.test(normalized);
}

function hasCustomerScopeOrPriceSignal(normalized: string) {
  return /\b(?:tang(?: them)?\s+(?:\d|gia|phi|tien|bao gia)|them (?:hang muc|vat tu|phi|chi phi)|thay (?:bong|driver|day|vat tu|linh kien)|mo rong pham vi|doi (?:gia|phi|bao gia)|(?:increase|change|set) (?:the )?(?:price|cost|fee|quote)|add (?:a |the )?(?:fee|cost|item|material|scope)|replace (?:a |the )?(?:bulb|driver|wire|material|part)|expand (?:the )?scope)\b/.test(normalized);
}

function isCustomerWorkflowStatusQuestion(text: string) {
  const normalized = normalizeWorkflowText(text);
  return /\b(?:dang o buoc nao|den buoc nao|tinh trang (?:hien tai|bay gio)?|hien (?:tai|gio).{0,48}\b(?:buoc|tinh trang|thanh toan)|thanh toan (?:ngay|bay gio|luc nao)|khi nao (?:thanh toan|tra tien)|current (?:step|status)|what (?:step|status)|pay (?:now|yet|when)|payment (?:now|due|when))\b/.test(normalized);
}

function isCustomerPaymentQuestion(text: string) {
  const normalized = normalizeWorkflowText(text);
  return /\b(?:payment|thanh toan|phuong thuc|ma qr|vietqr|chuyen khoan)\b/.test(normalized);
}

function isCustomerCheckInBypassRequest(text: string) {
  const normalized = normalizeWorkflowText(text);
  const mentionsCheckIn = /\b(?:check[- ]?in|anh tai sanh|anh xac nhan co mat)\b/.test(normalized);
  const asksToBypass = /\b(?:bo qua|khong can|skip|bypass)\b/.test(normalized);
  return mentionsCheckIn && asksToBypass;
}

function isCustomerPreCheckInAccessRequest(text: string) {
  const normalized = normalizeWorkflowText(text);
  const mentionsCheckIn = /\b(?:check[- ]?in|anh tai sanh|anh xac nhan co mat)\b/.test(normalized);
  const asksForApartmentAccess = /\b(?:cho (?:tho|nguoi tho) len(?: can ho)?|cho phep.*(?:tho.*)?(?:len|vao)|(?:len|vao) can ho|(?:allow|let).*(?:worker.*)?(?:enter|apartment|unit)|release.*(?:apartment|unit))\b/.test(normalized);
  const asksBeforeCheckIn = /\b(?:chua(?: co)?|truoc khi|bo qua|before|without|skip|bypass)\b/.test(normalized);
  return mentionsCheckIn && asksForApartmentAccess && asksBeforeCheckIn;
}

function customerArrivedCheckInGateMessage(language: KaelPromptLanguage) {
  return language === "en"
    ? "No. Payment is not due at this step, and a required lobby-photo check-in cannot be skipped. The worker must complete check-in and inspect the work area first; payment opens only after the work is complete and you confirm it."
    : "Không. Ở bước này chưa thanh toán, và không được bỏ qua việc xác nhận có mặt bằng ảnh tại sảnh khi ứng dụng yêu cầu. Thợ cần hoàn tất xác nhận có mặt rồi kiểm tra vị trí xử lý; thanh toán chỉ mở sau khi công việc hoàn tất và bạn xác nhận.";
}

function customerArrivedApartmentAccessGateMessage(language: KaelPromptLanguage) {
  return language === "en"
    ? "No. Before the worker completes the lobby-photo check-in, you cannot authorize entry to the apartment or begin inspection. After check-in, the app will show the step for you to authorize access to the unit; payment is not available at this step."
    : "Không. Trước khi thợ xác nhận có mặt bằng ảnh tại sảnh, bạn chưa thể cho phép họ lên căn hộ hoặc bắt đầu kiểm tra. Sau khi xác nhận có mặt, ứng dụng sẽ hiện bước để bạn cho phép họ lên căn hộ; thanh toán chưa mở ở bước này.";
}

function customerPaymentUnavailableMessage(language: KaelPromptLanguage) {
  return language === "en"
    ? "You have confirmed completion and do not need to return to an earlier step. The job screen currently has no available payment method, so there is no payment action for you to complete yet; wait for the official payment method to be configured. Kael opens the next step only after the system verifies the transaction."
    : "Bạn đã xác nhận hoàn thành và không cần quay lại bước cũ. Hiện màn công việc chưa có phương thức thanh toán khả dụng, nên chưa có thao tác thanh toán nào để bạn hoàn tất; hãy chờ phương thức thanh toán chính thức được cấu hình. Kael chỉ mở bước tiếp theo sau khi hệ thống xác thực giao dịch.";
}

function customerWorkflowStatusMessage(
  status: string,
  language: KaelPromptLanguage,
  paymentRailAvailable = true,
) {
  if (status === "confirmed_by_customer" && !paymentRailAvailable) {
    return customerPaymentUnavailableMessage(language);
  }
  if (language === "en") {
    switch (status) {
      case "awaiting_customer_confirm":
        return "The estimate and scope are ready for your review. Confirm or decline them in the app; payment is not due yet.";
      case "broadcasting":
      case "worker_candidate_pending":
        return "Kael is finding a suitable worker. Payment is not due yet.";
      case "worker_matched":
        return "A worker has been matched to the job. Follow their arrival updates; payment is not due yet.";
      case "worker_on_way":
        return "The worker is on the way. Please wait for the on-site check; payment is not due yet.";
      case "arrived":
        return "The worker has arrived. Next, they must complete the required lobby-photo check-in, then inspect the work area before any work begins; payment is not due yet.";
      case "inspecting":
        return "The worker is inspecting the issue. If additional work is needed, you will receive a separate scope proposal; payment is not due yet.";
      case "repairing":
        return "The worker is carrying out the confirmed work. Payment is not due yet.";
      case "scope_change_pending":
        return "A scope-change proposal is waiting for your review. Decide on it in the app before any extra work; payment is not due yet.";
      case "completed_by_worker":
        return "The worker has reported the job complete. Review the result before confirming completion; payment is not due yet.";
      case "confirmed_by_customer":
        return "You have confirmed completion. The next step is payment in the app.";
      case "payment_pending":
        return "The job is ready for payment. Complete payment in the app using the displayed instructions.";
      case "paid":
        return "Payment has been recorded. You can review the completed job in the app.";
      default:
        return "The job is progressing in the NestScout workflow. Check the job screen for the current step and available action.";
    }
  }

  switch (status) {
    case "awaiting_customer_confirm":
      return "Ước tính và phạm vi đang chờ bạn xem lại. Bạn có thể xác nhận hoặc từ chối trong ứng dụng; chưa cần thanh toán.";
    case "broadcasting":
    case "worker_candidate_pending":
      return "Kael đang tìm thợ phù hợp. Bạn chưa cần thanh toán.";
    case "worker_matched":
      return "Đã có thợ nhận công việc. Bạn theo dõi cập nhật thợ đến nơi; chưa cần thanh toán.";
    case "worker_on_way":
      return "Thợ đang trên đường đến. Hãy chờ kiểm tra tại chỗ; chưa cần thanh toán.";
    case "arrived":
      return "Thợ đã đến nơi. Bước tiếp theo là thợ xác nhận có mặt bằng ảnh tại sảnh, rồi kiểm tra vị trí xử lý trước khi bắt đầu công việc; chưa cần thanh toán.";
    case "inspecting":
      return "Thợ đang kiểm tra sự cố. Nếu cần làm thêm, bạn sẽ nhận đề xuất phạm vi riêng; chưa cần thanh toán.";
    case "repairing":
      return "Thợ đang thực hiện hạng mục đã được xác nhận. Bạn chưa cần thanh toán.";
    case "scope_change_pending":
      return "Đề xuất thay đổi phạm vi đang chờ bạn xem lại. Hãy quyết định trong ứng dụng trước khi có hạng mục phát sinh; chưa cần thanh toán.";
    case "completed_by_worker":
      return "Thợ đã báo hoàn thành. Hãy xem lại kết quả trước khi xác nhận hoàn thành; chưa cần thanh toán.";
    case "confirmed_by_customer":
      return "Bạn đã xác nhận hoàn thành. Bước tiếp theo là thanh toán trong ứng dụng.";
    case "payment_pending":
      return "Công việc đã sẵn sàng thanh toán. Hãy thanh toán trong ứng dụng theo hướng dẫn hiển thị.";
    case "paid":
      return "Thanh toán đã được ghi nhận. Bạn có thể xem lại công việc hoàn thành trong ứng dụng.";
    default:
      return "Công việc đang tiếp tục theo quy trình NestScout. Hãy mở màn hình công việc để xem bước hiện tại và thao tác khả dụng.";
  }
}

function normalizeWorkflowText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
