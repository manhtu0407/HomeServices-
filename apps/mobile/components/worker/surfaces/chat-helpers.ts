// Worker chat/brief localizers + copy helpers, extracted from worker-surfaces.tsx (C4 stage 5).
import { Platform } from 'react-native'
import { HCMC_DISTRICTS, LOCAL_DEAL_ID, normalizeDistrict } from '@home-services/shared'
import type { DistrictSlug, LocalDeal, LocalDealStatus } from '@home-services/shared'
import { appCopy, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel } from '@/lib/app-language'
import type { JobMessageResponse, KaelChatProgress, WorkerKaelChatTurn } from '@/lib/api-types'
import { workerCopy } from './copy'
import type { WorkerBroadcastView, WorkerLanguageMode, WorkerWebSpeechRecognitionConstructor } from './types'

export function buildWorkerBroadcastBrief(deal: LocalDeal | null, broadcast: WorkerBroadcastView, status: LocalDealStatus | null, language: WorkerLanguageMode, canWorkerSeeFullAddress: boolean): string[] {
  const serviceLabel = localizedServiceLabel(broadcast.serviceType, language)
  const problemLabel = localizedWorkerProblemSummary(broadcast, language)
  const areaLabel = localizedWorkerAreaLabel(broadcast.generalArea, language)
  const fullAddressLabel = broadcast.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const canRevealFullAddress = Boolean(canWorkerSeeFullAddress && isAcceptedLocalWorkerDeal(deal) && fullAddressLabel)
  const addressAccess = broadcast.addressAccess ?? null
  const hasAcceptedBuildingAccess = Boolean(isAcceptedLocalWorkerDeal(deal) && addressAccess?.release_stage === 'building_released')
  const addressGate = language === 'en'
    ? canRevealFullAddress && fullAddressLabel
      ? `Address: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.`
      : hasAcceptedBuildingAccess
        ? `${areaLabel}. Exact unit unlocks after lobby check-in and identity check.`
        : `${areaLabel}. Detailed address is hidden until acceptance.`
    : canRevealFullAddress && fullAddressLabel
      ? `Địa chỉ: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.`
      : `Khu vực: ${areaLabel}. Địa chỉ chi tiết vẫn ẩn trước khi nhận.`
  const stagedAddressGate = hasAcceptedBuildingAccess && !canRevealFullAddress
    ? language === 'en'
      ? `${areaLabel}. Exact unit unlocks after lobby check-in and identity check.`
      : `Khu v\u1ef1c: ${areaLabel}. C\u0103n h\u1ed9 ch\u1ec9 m\u1edf sau check-in s\u1ea3nh v\u00e0 x\u00e1c nh\u1eadn danh t\u00ednh.`
    : addressGate
  const accessLine = buildWorkerApartmentAccessBriefLine(addressAccess, language)
  const statusLine = localizedStatusLabel(status, language)
  const mediaLine = deal?.draft.mediaCount
    ? language === 'en'
      ? `${deal.draft.mediaCount} media item attached.`
      : `Có ${deal.draft.mediaCount} ảnh/video.`
    : null

  const artifactBriefLines = localizedWorkerBriefLines(broadcast.prebrief, language)
  const briefLines = [
    `${serviceLabel} · ${problemLabel}`,
    stagedAddressGate,
    accessLine,
    ...artifactBriefLines,
    mediaLine ?? statusLine,
  ].filter((line): line is string => Boolean(line))
  return briefLines.slice(0, 4)
}

export function buildWorkerApartmentAccessBriefLine(
  addressAccess: WorkerBroadcastView['addressAccess'] | null | undefined,
  language: WorkerLanguageMode,
) {
  if (!addressAccess || addressAccess.release_stage === 'area_only') return null
  const profile = addressAccess.access_profile ?? {}
  const detail = [
    profile.entry_method,
    profile.guard_note,
    profile.parking_note,
    profile.building_note,
    profile.customer_handoff_note,
  ].find((item) => typeof item === 'string' && item.trim().length > 0)?.trim()
  if (language === 'en') {
    return detail
      ? `App-only access: ${detail}. Verify identity at the door.`
      : 'App-only access. Verify identity at the door.'
  }
  return detail
    ? `V\u00e0o nh\u00e0 qua app: ${detail}. Ki\u1ec3m tra danh t\u00ednh \u1edf c\u1eeda.`
    : `V\u00e0o nh\u00e0 qua app. Ki\u1ec3m tra danh t\u00ednh \u1edf c\u1eeda.`
}

export function uniqueWorkerBriefLines(lines: string[]) {
  const seen = new Set<string>()
  const uniqueLines: string[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const normalized = line.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    uniqueLines.push(line)
  }
  return uniqueLines
}

export const workerVietnameseSignalPattern = /[\u00c0-\u1ef9]/i
export const workerAsciiOnlyPattern = /^[\x00-\x7F]*$/

export function localizedWorkerBriefLines(lines: string[], language: WorkerLanguageMode) {
  return uniqueWorkerBriefLines(lines).filter((line) => {
    const hasVietnameseText = workerVietnameseSignalPattern.test(line)
    if (language === 'en') return !hasVietnameseText
    return hasVietnameseText || !workerAsciiOnlyPattern.test(line)
  })
}

export function localizedWorkerProblemSummary(broadcast: WorkerBroadcastView, language: WorkerLanguageMode) {
  return localizedProblemLabel(broadcast.problemSummary, broadcast.serviceType, language)
}

export function canonicalWorkerAreaLabel(area: string) {
  const trimmed = area.trim()
  if (!trimmed) return null
  const directSlug = normalizeDistrict(trimmed)
  if (directSlug !== 'hcmc_all' || /^hcmc_all$/i.test(trimmed)) return HCMC_DISTRICTS[directSlug]
  const aliasKey = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const aliasSlug = workerDistrictTextAliases[aliasKey]
  return aliasSlug ? HCMC_DISTRICTS[aliasSlug] : null
}

export function localizedWorkerAreaLabel(area: string | null | undefined, language: WorkerLanguageMode) {
  if (!area) return appCopy[language].common.noData
  const canonicalArea = canonicalWorkerAreaLabel(area) ?? area
  if (language === 'vi') return localizeWorkerAreaFallback(canonicalArea)
  const mapped = canonicalArea
    .replace(/^Khu vực:\s*/i, '')
    .replace(/Khu vực TP\.?HCM/gi, 'Ho Chi Minh City area')
    .replace(/Khu vực chung/gi, 'General area')
    .replace(/Quận\s*(\d+)/gi, 'District $1')
    .replace(/TP\.?\s*HCM|Thành phố Hồ Chí Minh/gi, 'HCMC')
  return mapped.trim() || appCopy[language].common.noData
}

export function localizeWorkerAreaFallback(area: string) {
  return area
    .replace(/\bquan\s*(\d+)\b/gi, 'Quận $1')
    .replace(/\bq\s*\.?\s*(\d+)\b/gi, 'Quận $1')
    .replace(/\bBinh Thanh\b/gi, 'Bình Thạnh')
    .replace(/\bThu Duc\b/gi, 'Thủ Đức')
    .replace(/\bTan Binh\b/gi, 'Tân Bình')
    .replace(/\bGo Vap\b/gi, 'Gò Vấp')
    .replace(/\bPhu Nhuan\b/gi, 'Phú Nhuận')
    .trim()
}

export function formatWorkerMoney(value: number, language: WorkerLanguageMode) {
  if (!Number.isFinite(value) || value <= 0) return appCopy[language].common.noData
  const formatted = workerMoneyFormatters[language].format(value)
  return language === 'vi' ? `${formatted} đ` : `${formatted} VND`
}

export function workerChatDealKey(deal: LocalDeal | null) {
  if (!deal?.broadcast) return 'none'
  return [
    deal.broadcast.broadcastId ?? deal.broadcast.jobId ?? deal.id,
    deal.broadcast.status,
    deal.draft.serviceType ?? 'none',
    deal.draft.problemChips.join('|'),
    deal.draft.description,
    deal.draft.districtLabel,
  ].join('::')
}

export function getWorkerChatJobId(deal: LocalDeal | null) {
  const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  if (!jobId || jobId === LOCAL_DEAL_ID) return null
  return jobId
}

export function workerChatMessageFromJobMessage(message: JobMessageResponse, currentUserId: string | null, language: WorkerLanguageMode) {
  const system = message.sender_role === 'kael'
  const mine = Boolean(currentUserId && message.sender_id === currentUserId)
  const who = system
    ? 'Kael'
    : message.sender_role === 'worker'
      ? workerCopy[language].chat.worker
      : language === 'en'
        ? 'Customer'
        : 'Khách'

  return {
    id: message.id,
    mine,
    system,
    text: message.content,
    who,
  }
}

export function workerChatMessageFromWorkerKaelTurn(turn: WorkerKaelChatTurn, language: WorkerLanguageMode) {
  const mine = turn.role === 'worker'
  const text = workerKaelTurnText(turn, language)
  return {
    id: `worker-kael-${turn.id}`,
    mine,
    system: !mine,
    text,
    who: mine ? workerCopy[language].chat.worker : workerCopy[language].chat.kael,
  }
}

export function workerKaelTurnText(turn: WorkerKaelChatTurn, language: WorkerLanguageMode) {
  const base = turn.text_content?.trim() ||
    (language === 'en' ? 'Kael saved this advisory turn.' : 'Kael \u0111\u00e3 l\u01b0u l\u01b0\u1ee3t t\u01b0 v\u1ea5n n\u00e0y.')
  const notes = workerKaelSafetyNotes(turn.safe_metadata).slice(0, 2)
  if (notes.length === 0 || turn.role === 'worker') return base
  return `${base}\n${notes.map((note) => `- ${note}`).join('\n')}`
}

export function workerKaelSafetyNotes(metadata: Record<string, unknown>) {
  const raw = metadata.safety_notes
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

export function workerKaelChatErrorCopy(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Kael could not load the advisory chat. Try again shortly.'
    : 'Kael ch\u01b0a t\u1ea3i \u0111\u01b0\u1ee3c chat t\u01b0 v\u1ea5n. Th\u1eed l\u1ea1i sau \u00edt ph\u00fat.'
}

export function workerKaelChatStatusCopy(language: WorkerLanguageMode, sending: boolean) {
  if (sending) {
    return language === 'en'
      ? 'Kael is checking the accepted job context.'
      : 'Kael \u0111ang ki\u1ec3m tra ng\u1eef c\u1ea3nh vi\u1ec7c \u0111\u00e3 nh\u1eadn.'
  }
  return language === 'en'
    ? 'Loading Kael advisory chat.'
    : '\u0110ang t\u1ea3i chat t\u01b0 v\u1ea5n Kael.'
}

export function workerKaelChatProgressCopy(progress: KaelChatProgress | null, language: WorkerLanguageMode) {
  if (!progress) return null
  const percent = `${Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%`
  if (progress.status === 'failed') {
    return language === 'en' ? `Kael advisory stopped at ${percent}.` : `Tư vấn Kael dừng ở ${percent}.`
  }
  if (progress.current_stage === 'worker_assist') {
    if (progress.status === 'completed') {
      return language === 'en' ? 'Kael advisory is ready.' : 'Kael đã có tư vấn.'
    }
    return language === 'en'
      ? `Kael is checking this job: ${percent}.`
      : `Kael đang xét việc này: ${percent}.`
  }
  return language === 'en' ? `Kael is working: ${percent}.` : `Kael đang xử lý: ${percent}.`
}

export function workerKaelTrainingConsentLabel(language: WorkerLanguageMode, consent: boolean) {
  if (language === 'en') return consent ? 'Training on' : 'Training off'
  return consent ? 'Cho ph\u00e9p h\u1ecdc' : 'T\u1eaft h\u1ecdc'
}

export function workerKaelTrainingConsentBody(language: WorkerLanguageMode, consent: boolean) {
  if (language === 'en') {
    return consent
      ? 'Worker advisory feedback may be reviewed to improve Kael.'
      : 'Kael will save feedback, but not use it for training review without consent.'
  }
  return consent
    ? 'Ph\u1ea3n h\u1ed3i t\u01b0 v\u1ea5n c\u00f3 th\u1ec3 \u0111\u01b0\u1ee3c r\u00e0 so\u00e1t \u0111\u1ec3 c\u1ea3i thi\u1ec7n Kael.'
    : 'Kael l\u01b0u ph\u1ea3n h\u1ed3i, nh\u01b0ng kh\u00f4ng d\u00f9ng cho review hu\u1ea5n luy\u1ec7n n\u1ebfu ch\u01b0a cho ph\u00e9p.'
}

export function workerKaelFeedbackRequiredCopy(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Feedback needs at least 8 characters.'
    : 'Ph\u1ea3n h\u1ed3i c\u1ea7n \u00edt nh\u1ea5t 8 k\u00fd t\u1ef1.'
}

export function workerKaelFeedbackSaveErrorCopy(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Kael could not save this feedback. Try again.'
    : 'Kael ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c ph\u1ea3n h\u1ed3i. Th\u1eed l\u1ea1i sau.'
}

export function workerChatStandaloneInputLabel(language: WorkerLanguageMode) {
  return language === 'en' ? 'Message Kael...' : 'Nhắn với Kael...'
}

export function workerChatStandaloneAccessibilityLabel(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Message Kael. Real JobRoom messages are saved after an accepted job.'
    : 'Nhắn với Kael. Tin nhắn Phòng việc thật sẽ được lưu sau khi thợ nhận việc.'
}

export function workerChatStandaloneReply(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Kael needs a real JobRoom before saving messages. When a request is accepted, real customer chat opens here.'
    : 'Kael cần có Phòng việc thật trước khi lưu tin nhắn. Khi có yêu cầu đã nhận, chat thật với khách sẽ mở ở đây.'
}

export function appendWorkerChatDraftSegment(draft: string, segment: string) {
  const cleanDraft = draft.trim()
  const cleanSegment = segment.trim()
  if (!cleanSegment) return cleanDraft
  return cleanDraft ? `${cleanDraft} ${cleanSegment}` : cleanSegment
}

export function workerChatAttachmentFallbackName(language: WorkerLanguageMode) {
  return language === 'en' ? 'selected image' : 'ảnh đã chọn'
}

export function workerChatAttachmentDraftLine(language: WorkerLanguageMode, fileName: string) {
  const cleanName = fileName.trim() || workerChatAttachmentFallbackName(language)
  return language === 'en' ? `Selected image: ${cleanName}` : `Ảnh đã chọn: ${cleanName}`
}

export function workerChatAttachmentPermissionBody(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Allow photo library access to attach an image note.'
    : 'Cho phép truy cập thư viện ảnh để đính kèm ghi chú ảnh.'
}

export function workerChatAttachmentReadyBody(language: WorkerLanguageMode, canSend: boolean) {
  if (language === 'en') {
    return canSend
      ? 'The image name was added to the message. Send it now; real media evidence still stays in the matching evidence step.'
      : 'The image name was added to the draft. Real media upload opens after a real JobRoom exists.'
  }
  return canSend
    ? 'Tên ảnh đã được thêm vào tin nhắn. Gửi ghi chú này trước; media thật vẫn nằm ở bước bằng chứng phù hợp.'
    : 'Tên ảnh đã được thêm vào ô nhắn. Media thật sẽ mở sau khi có Phòng việc thật.'
}

export function workerChatMicListeningBody(language: WorkerLanguageMode) {
  return language === 'en' ? 'Listening now. The transcript will be added to the message box.' : 'Đang nghe. Nội dung nhận được sẽ được thêm vào ô nhắn.'
}

export function workerChatMicUnavailableBody(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Voice dictation is not available on this device yet. Type the note so Kael can keep context.'
    : 'Thiết bị này chưa mở đọc giọng nói. Nhập ghi chú để Kael giữ bối cảnh.'
}

export function getWorkerWebSpeechRecognition(): WorkerWebSpeechRecognitionConstructor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null
  const speechWindow = window as unknown as {
    SpeechRecognition?: WorkerWebSpeechRecognitionConstructor
    webkitSpeechRecognition?: WorkerWebSpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}


const workerMoneyFormatters = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }),
} as const

const workerDistrictTextAliases: Partial<Record<string, DistrictSlug>> = {
  'binh chanh': 'binh_chanh',
  'binh tan': 'binh_tan',
  'binh thanh': 'binh_thanh',
  'can gio': 'can_gio',
  'cu chi': 'cu_chi',
  'go vap': 'go_vap',
  'hoc mon': 'hoc_mon',
  'nha be': 'nha_be',
  'phu nhuan': 'phu_nhuan',
  'tan binh': 'tan_binh',
  'tan phu': 'tan_phu',
  'thu duc': 'thu_duc',
}

export function isAcceptedLocalWorkerDeal(deal: LocalDeal | null) {
  return deal?.broadcast?.status === 'accepted'
}
