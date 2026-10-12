// Normal chat may notice a service need and offer to start one; the chip only opens booking with the
// service preselected. Nothing starts until the customer fills in and confirms the request there.

import {
  kaelNextActionsSchema,
  type EdgeKaelNextAction,
} from "../../../../_shared/contracts/kael-next-actions.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import { asRecord } from "../../platform/coercions.ts";

// The names the booking screen shows, so the chip reads the same as the service it opens.
const BOOKING_SERVICE_NAMES: Record<ServiceType, { vi: string; en: string }> = {
  electrical: { vi: "Sửa điện", en: "Electrical repair" },
  plumbing: { vi: "Sửa nước", en: "Plumbing repair" },
  cleaning: { vi: "Vệ sinh nhà cửa", en: "Home cleaning" },
  hvac: { vi: "Điều hòa", en: "Air conditioning" },
  upholstery: { vi: "Sofa, nệm, rèm", en: "Sofa, mattress & curtains" },
  handyman: { vi: "Sửa vặt & Lắp đặt", en: "Minor repair & installation" },
};

export function startCaseNextAction(serviceType: ServiceType, language: "vi" | "en"): EdgeKaelNextAction {
  const label = language === "en"
    ? `Start: ${BOOKING_SERVICE_NAMES[serviceType].en}`
    : `Bắt đầu xử lý: ${BOOKING_SERVICE_NAMES[serviceType].vi}`;
  return { id: "start_case", kind: "start_case", label: label.slice(0, 60), service_type: serviceType };
}

// The exchange RPC stores metadata on the customer turn of each pair, so a Kael reply's next steps
// travel as reply_next_actions on the customer turn just before it.
export function customerConversationNextActions(
  role: "customer" | "kael" | "system",
  previousTurnMetadata: unknown,
): { next_actions?: EdgeKaelNextAction[] } {
  if (role !== "kael") return {};
  const parsed = kaelNextActionsSchema.safeParse(asRecord(previousTurnMetadata).reply_next_actions);
  return parsed.success && parsed.data.length > 0 ? { next_actions: parsed.data } : {};
}
