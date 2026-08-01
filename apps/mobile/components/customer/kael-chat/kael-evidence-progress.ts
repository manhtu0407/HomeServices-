import type { KaelChatProgress } from '@/lib/api-types'
import type { AppLanguage } from '@/lib/app-language'

import type { KaelProcessLine } from './kael-process-lines'

export type KaelEvidenceMediaProfile = {
  hasImage: boolean
  hasVideo: boolean
  hasVoiceTranscript: boolean
}

export function buildEvidencePreparationLine(language: AppLanguage): KaelProcessLine {
  return {
    durationMs: 0,
    key: 'evidence-preparation',
    stage: 'observe',
    status: 'running',
    text: language === 'vi'
      ? 'Đang chuẩn bị bằng chứng để gửi riêng tư.'
      : 'Preparing evidence for private submission.',
  }
}

export function buildEvidenceProgressLine({
  language,
  profile,
  progress,
}: {
  language: AppLanguage
  profile: KaelEvidenceMediaProfile
  progress: KaelChatProgress
}): KaelProcessLine {
  return {
    durationMs: 0,
    key: `evidence-${progress.current_stage}`,
    stage: processStage(progress.current_stage),
    status: progress.status,
    text: evidenceProgressText(language, profile, progress),
  }
}

function evidenceProgressText(
  language: AppLanguage,
  profile: KaelEvidenceMediaProfile,
  progress: KaelChatProgress,
) {
  if (progress.status === 'failed') {
    return language === 'vi'
      ? 'Kael chưa thể hoàn tất bước này. Kết quả sẽ nêu rõ trạng thái tiếp theo.'
      : 'Kael could not complete this step. The result will explain what happens next.'
  }

  const completed = progress.status === 'completed'
  if (progress.current_stage === 'vision_analysis') {
    if (profile.hasVideo) {
      return language === 'vi'
        ? (completed
          ? 'Kael đã kiểm tra các khung hình đã tách từ video.'
          : 'Kael đang kiểm tra các khung hình đã tách từ video.')
        : (completed
          ? 'Kael checked the frames extracted from the video.'
          : 'Kael is checking the frames extracted from the video.')
    }
    if (profile.hasImage) {
      return language === 'vi'
        ? (completed
          ? 'Kael đã kiểm tra vùng nhìn thấy và độ rõ của ảnh.'
          : 'Kael đang kiểm tra vùng nhìn thấy và độ rõ của ảnh.')
        : (completed
          ? 'Kael checked the visible area and clarity of the images.'
          : 'Kael is checking the visible area and clarity of the images.')
    }
    if (profile.hasVoiceTranscript) {
      return language === 'vi'
        ? (completed
          ? 'Kael đã đối chiếu bản chép lời đã được bạn kiểm tra.'
          : 'Kael đang đối chiếu bản chép lời đã được bạn kiểm tra.')
        : (completed
          ? 'Kael checked the transcript you reviewed.'
          : 'Kael is checking the transcript you reviewed.')
    }
    return language === 'vi'
      ? (completed
        ? 'Kael đã ghi nhận lần này chưa có bằng chứng kèm theo.'
        : 'Kael đang xác định thông tin còn thiếu vì lần này chưa có bằng chứng kèm theo.')
      : (completed
        ? 'Kael recorded that no evidence was included this time.'
        : 'Kael is identifying what is still needed because no evidence was included this time.')
  }

  const vi = {
    advisory_generation: completed ? 'Kael đã chuẩn bị hướng dẫn tiếp theo.' : 'Kael đang chuẩn bị hướng dẫn tiếp theo.',
    clarification: completed ? 'Kael đã xác định phần thông tin cần bổ sung.' : 'Kael đang xác định phần thông tin còn thiếu.',
    educational_response: completed ? 'Kael đã hoàn tất phần giải thích.' : 'Kael đang chuẩn bị phần giải thích.',
    intent_classification: completed
      ? 'Kael đã xác thực ngữ cảnh và loại công việc.'
      : 'Kael đang xác thực ngữ cảnh và loại công việc.',
    market_lookup: completed
      ? 'Kael đã đối chiếu dữ liệu giá theo khu vực.'
      : 'Kael đang đối chiếu dữ liệu giá theo khu vực.',
    post_job_learning: completed ? 'Kael đã hoàn tất cập nhật nội bộ.' : 'Kael đang hoàn tất cập nhật nội bộ.',
    price_synthesis: completed
      ? 'Kael đã rà soát phạm vi, rủi ro và ước tính.'
      : 'Kael đang rà soát phạm vi, rủi ro và ước tính.',
    problem_synthesis: completed
      ? 'Kael đã tổng hợp hiện trạng từ bằng chứng đã xác nhận.'
      : 'Kael đang tổng hợp hiện trạng từ bằng chứng đã xác nhận.',
    scope_change: completed ? 'Kael đã hoàn tất rà soát phạm vi.' : 'Kael đang rà soát thay đổi phạm vi.',
    scope_estimating: completed ? 'Kael đã hoàn tất ước tính thay đổi.' : 'Kael đang ước tính phần thay đổi.',
    scope_reviewing: completed ? 'Kael đã hoàn tất kiểm tra thay đổi.' : 'Kael đang kiểm tra thay đổi phạm vi.',
    worker_assist: completed ? 'Kael đã hoàn tất hỗ trợ thực hiện.' : 'Kael đang chuẩn bị hỗ trợ thực hiện.',
    worker_brief: completed ? 'Kael đã hoàn tất tóm tắt công việc.' : 'Kael đang chuẩn bị tóm tắt công việc.',
  } as const
  const en = {
    advisory_generation: completed ? 'Kael prepared the next guidance.' : 'Kael is preparing the next guidance.',
    clarification: completed ? 'Kael identified the information still needed.' : 'Kael is identifying what is still needed.',
    educational_response: completed ? 'Kael completed the explanation.' : 'Kael is preparing the explanation.',
    intent_classification: completed
      ? 'Kael validated the context and service type.'
      : 'Kael is validating the context and service type.',
    market_lookup: completed
      ? 'Kael checked price information for the area.'
      : 'Kael is checking price information for the area.',
    post_job_learning: completed ? 'Kael completed the internal update.' : 'Kael is completing the internal update.',
    price_synthesis: completed
      ? 'Kael reviewed the scope, risk, and estimate.'
      : 'Kael is reviewing the scope, risk, and estimate.',
    problem_synthesis: completed
      ? 'Kael summarized the confirmed evidence.'
      : 'Kael is summarizing the confirmed evidence.',
    scope_change: completed ? 'Kael completed the scope review.' : 'Kael is reviewing the scope change.',
    scope_estimating: completed ? 'Kael completed the change estimate.' : 'Kael is estimating the change.',
    scope_reviewing: completed ? 'Kael completed the change check.' : 'Kael is checking the scope change.',
    worker_assist: completed ? 'Kael completed the work support.' : 'Kael is preparing work support.',
    worker_brief: completed ? 'Kael completed the work brief.' : 'Kael is preparing the work brief.',
  } as const

  return language === 'vi'
    ? vi[progress.current_stage]
    : en[progress.current_stage]
}

function processStage(stage: KaelChatProgress['current_stage']): KaelProcessLine['stage'] {
  switch (stage) {
    case 'vision_analysis':
      return 'verify'
    case 'problem_synthesis':
      return 'analyze'
    case 'market_lookup':
      return 'compare'
    case 'price_synthesis':
    case 'scope_estimating':
      return 'risk'
    case 'intent_classification':
    case 'clarification':
      return 'context'
    default:
      return 'compose'
  }
}
