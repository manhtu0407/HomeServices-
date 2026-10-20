import type { AppLanguage } from '@/lib/app-language'

import type { QuoteBlockerView } from './quote-blocker-view-model'

const customerSafetyStepCodes = new Set([
  'electrical_immediate_hazard',
  'plumbing_active_damage_or_contamination',
  'hvac_electrical_refrigerant_or_burning_hazard',
])
const onSiteAssessmentCodes = new Set([
  'plumbing_concealed_or_building_system',
  'fabric_contamination_or_chemical_risk',
  'handyman_structural_or_concealed_service_risk',
])
const specialistHandoffCodes = new Set([
  'cleaning_hazardous_material',
  'handyman_specialist_boundary',
])

export function localizedCaseWorkSafetyMessage(code: string, language: AppLanguage) {
  if (customerSafetyStepCodes.has(code)) {
    return language === 'vi'
      ? 'Tạm dừng sử dụng khu vực hoặc thiết bị có dấu hiệu nguy hiểm và chờ người đủ chuyên môn kiểm tra.'
      : 'Stop using the area or device that may be unsafe and wait for a qualified professional to inspect it.'
  }
  if (onSiteAssessmentCodes.has(code)) {
    return language === 'vi'
      ? 'Ca này cần đánh giá trực tiếp trước khi Kael có thể chốt phạm vi hoặc giá.'
      : 'This case needs an on-site assessment before Kael can finalize the scope or price.'
  }
  if (specialistHandoffCodes.has(code)) {
    return language === 'vi'
      ? 'Dấu hiệu hiện tại cần chuyển cho thợ chuyên môn phù hợp; Kael chưa mở báo giá tự động.'
      : 'The current signs require a suitably qualified specialist; Kael has not opened an automatic offer.'
  }
  return language === 'vi'
    ? 'Kael chỉ tìm thợ có năng lực đã xác minh phù hợp với dấu hiệu này.'
    : 'Kael will only look for a worker whose verified capabilities match these signs.'
}

export function localizedCaseWorkEvidencePrompt(input: {
  blockers: readonly string[]
  evidenceKind?: 'photo' | 'video_frame' | 'voice_transcript'
  language: AppLanguage
}) {
  if (input.blockers.includes('handyman_visual_evidence')) {
    return input.language === 'vi'
      ? 'Gửi ảnh rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước, dụng cụ cần dùng.'
      : 'Send a clear photo of the item and work area so Kael can check the surface, size, and tools needed.'
  }
  if (input.blockers.includes('upholstery_condition_visual_evidence')) {
    return input.language === 'vi'
      ? 'Bạn gửi một ảnh toàn bộ món đồ và một ảnh cận chất liệu hoặc vết cần xử lý để Kael không báo sai phạm vi vệ sinh.'
      : 'Send one photo of the whole item and one close-up of the material or stain so Kael does not misstate the cleaning scope.'
  }
  if (input.evidenceKind === 'voice_transcript') {
    return input.language === 'vi'
      ? 'Bạn đọc lại bản chép lời trên thiết bị, chỉnh nếu cần rồi xác nhận gửi cho Kael.'
      : 'Review the on-device transcript, edit it if needed, then confirm it for Kael.'
  }
  return input.language === 'vi'
    ? 'Bạn thêm bằng chứng hiện trạng được yêu cầu để Kael tiếp tục phân tích.'
    : 'Add the requested current-condition evidence so Kael can continue the analysis.'
}

// Short customer-facing names for the HVAC quote-driver slots; a slot without an entry is described
// generically instead of showing its internal key.
const QUOTE_SLOT_LABELS: Record<string, { en: string; vi: string }> = {
  requested_work_mode: { en: 'Clean or repair', vi: 'Vệ sinh hay sửa' },
  unit_type_count_and_capacity: { en: 'Unit type', vi: 'Loại máy lạnh' },
  symptom_and_operating_condition: { en: 'What happens', vi: 'Hiện tượng máy' },
  maintenance_history: { en: 'Last service', vi: 'Lần vệ sinh trước' },
  indoor_outdoor_unit_access: { en: 'Outdoor unit', vi: 'Vị trí cục nóng' },
  drain_electrical_or_refrigerant_signs: { en: 'Other signs', vi: 'Dấu hiệu khác' },
  parts_and_consumables_requirement: { en: 'Parts', vi: 'Linh kiện' },
}

export const quoteSlotKeys = Object.keys(QUOTE_SLOT_LABELS)

function describeMissingSlots(slots: readonly string[], language: AppLanguage) {
  const known = slots.flatMap((slot) => QUOTE_SLOT_LABELS[slot] ? [QUOTE_SLOT_LABELS[slot][language]] : [])
  const hasUnknown = known.length < slots.length
  if (known.length === 0) return language === 'vi' ? 'một số chi tiết phạm vi' : 'some scope details'
  const list = known.join(', ')
  if (!hasUnknown) return list
  return language === 'vi' ? `${list} và một số chi tiết khác` : `${list} and a few other details`
}

function describeRecorded(view: QuoteBlockerView, language: AppLanguage) {
  if (view.recorded.length === 0) return ''
  const items = view.recorded.map(({ slot, value }) => `${QUOTE_SLOT_LABELS[slot][language]}: ${value}`).join('; ')
  return language === 'vi' ? `Kael đã ghi nhận: ${items}. ` : `Kael recorded: ${items}. `
}

type QuoteBlockerCopy = Readonly<{ noteCopy: string; noteTitle: string; status: string; title: string }>

export function localizedQuoteBlockerCopy(view: QuoteBlockerView, language: AppLanguage): QuoteBlockerCopy {
  const recorded = describeRecorded(view, language)
  const missing = describeMissingSlots(view.missingSlots, language)
  const vi = language === 'vi'
  const unstarted = vi
    ? 'Hệ thống chưa tìm thợ và chưa tạo khoản thanh toán.'
    : 'No worker search or payment has started.'
  const reviewing = vi ? 'Điều Kael đang kiểm tra' : 'What Kael is checking'
  const needs = vi ? 'Điều Kael còn thiếu' : 'What Kael still needs'
  const whyNoPrice = vi ? 'Vì sao chưa có giá' : 'Why there is no price yet'

  switch (view.kind) {
    case 'scope_missing':
      return {
        title: vi ? 'Cần thêm thông tin phạm vi' : 'More scope details needed',
        status: vi ? 'Chờ bạn bổ sung' : 'Waiting for your details',
        noteTitle: needs,
        noteCopy: vi
          ? `${recorded}Kael còn thiếu: ${missing}. Bạn nhắn thêm thông tin này trong khung chat để Kael tiếp tục. Chưa hiển thị giá; hệ thống chưa tìm thợ và chưa tạo khoản thanh toán.`
          : `${recorded}Kael still needs: ${missing}. Send this in the chat so Kael can continue. No price is shown yet; no worker search or payment has started.`,
      }
    case 'price_evidence_unavailable':
      return {
        title: vi ? 'Chưa có nguồn giá đã kiểm chứng' : 'No verified price source yet',
        status: vi ? 'Đang rà soát giá' : 'Checking price sources',
        noteTitle: whyNoPrice,
        noteCopy: vi
          ? `${recorded}Thông tin phạm vi đã đủ nên bạn không cần nhập lại. Kael chưa có nguồn giá đã kiểm chứng, nên chưa hiển thị giá và không tự đoán giá. ${unstarted} Bạn có thể nhắn thêm chi tiết nếu muốn Kael kiểm tra lại.`
          : `${recorded}Your scope details are complete, so you do not need to enter them again. Kael has no validated price evidence yet, so it is not showing a price and will not guess one. ${unstarted} You can add more detail if you want Kael to check again.`,
      }
    case 'scope_and_price_missing':
      return {
        title: vi ? 'Thiếu thông tin và nguồn giá' : 'Details and price source missing',
        status: vi ? 'Chờ bạn bổ sung' : 'Waiting for your details',
        noteTitle: needs,
        noteCopy: vi
          ? `${recorded}Kael còn thiếu: ${missing}. Ngoài ra Kael chưa có nguồn giá đã kiểm chứng, nên chưa hiển thị giá và không tự đoán giá. Bạn nhắn thêm thông tin còn thiếu trong khung chat. ${unstarted}`
          : `${recorded}Kael still needs: ${missing}. Kael also has no validated price evidence yet, so it is not showing a price and will not guess one. Send the missing details in the chat. ${unstarted}`,
      }
    case 'inspection_required':
      return {
        title: vi ? 'Cần khảo sát tại chỗ' : 'On-site inspection needed',
        status: vi ? 'Đang rà soát' : 'Under review',
        noteTitle: whyNoPrice,
        noteCopy: vi
          ? `${recorded}${view.missingSlots.length > 0 ? `Kael chưa xác nhận được: ${missing}. ` : ''}Ca này cần thợ khảo sát trực tiếp trước khi chốt phạm vi và giá, nên Kael chưa hiển thị giá. ${unstarted}`
          : `${recorded}${view.missingSlots.length > 0 ? `Kael could not confirm: ${missing}. ` : ''}This case needs a worker to inspect in person before the scope and price are final, so Kael is not showing a price. ${unstarted}`,
      }
    case 'policy_blocked':
      return {
        title: vi ? 'Chưa mở báo giá cho yêu cầu này' : 'Quote not open for this request',
        status: vi ? 'Tạm dừng' : 'On hold',
        noteTitle: vi ? 'Vì sao tạm dừng' : 'Why it is on hold',
        noteCopy: vi
          ? `Chính sách dịch vụ hiện chưa cho phép tiếp tục yêu cầu này, nên Kael chưa hiển thị giá. ${unstarted}`
          : `The current service policy does not allow this request to continue, so Kael is not showing a price. ${unstarted}`,
      }
    case 'support_review':
      return {
        title: vi ? 'Cần người hỗ trợ rà soát' : 'Support review needed',
        status: vi ? 'Đang rà soát' : 'Under review',
        noteTitle: reviewing,
        noteCopy: vi
          ? 'Kael chưa đủ chắc chắn sau các lượt thu thập hiện tại. Yêu cầu cần người hỗ trợ rà soát trước khi mở báo giá.'
          : 'Kael is not confident enough after the current intake turns. A support specialist must review the case before an offer opens.',
      }
    case 'review_unspecified':
      return {
        title: vi ? 'Báo giá cần rà soát' : 'Quote requires review',
        status: vi ? 'Đang rà soát' : 'Under review',
        noteTitle: reviewing,
        noteCopy: vi
          ? `Kael chưa thể hiển thị giá cho yêu cầu này và đang rà soát. Kael không tự đoán giá. ${unstarted}`
          : `Kael cannot show a price for this request yet and is reviewing it. Kael will not guess a price. ${unstarted}`,
      }
  }
}
