import type { DisciplinePolicyView, WorkerViolationCaseView } from '@/lib/api-types/program'
import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'

const VIOLATION_LABELS: Record<string, [string, string]> = {
  late_arrival: ['Đến trễ so với giờ hẹn', 'Late arrival'],
  slow_response: ['Phản hồi chậm', 'Slow response'],
  cancel_after_accept_no_reason: ['Hủy việc đã nhận không có lý do', 'Cancelled an accepted job without a reason'],
  no_show: ['Không đến như đã hẹn', 'No-show'],
  quality_complaint_confirmed: ['Khiếu nại chất lượng đã được xác nhận', 'Confirmed quality complaint'],
  off_app_dealing: ['Giao dịch với khách ngoài ứng dụng', 'Dealing with a customer outside the app'],
  extra_cash: ['Thu thêm tiền mặt ngoài giá đã chốt', 'Extra cash beyond the agreed price'],
  fake_customer: ['Tạo khách giả', 'Fake customer'],
  self_booking: ['Tự đặt việc cho chính mình', 'Self-booking'],
  fake_review: ['Đánh giá giả', 'Fake review'],
  fake_evidence: ['Bằng chứng giả', 'Fabricated evidence'],
  theft: ['Lấy tài sản của khách', 'Theft from a customer'],
  intentional_damage: ['Cố ý làm hư hại tài sản', 'Intentional damage'],
  harassment_sexual: ['Quấy rối tình dục', 'Sexual harassment'],
  violence: ['Bạo lực', 'Violence'],
  threats: ['Đe dọa khách', 'Threatening a customer'],
  covert_recording: ['Quay phim, ghi âm lén', 'Covert recording'],
}

const CONSEQUENCE_LABELS: Record<string, [string, string]> = {
  warning: ['Cảnh cáo', 'Warning'],
  matching_deprioritize: ['Giảm ưu tiên nhận việc', 'Lower matching priority'],
  points_debit: ['Trừ điểm đại sứ', 'Ambassador points deducted'],
  points_forfeit: ['Mất toàn bộ điểm chưa đổi', 'All unredeemed points forfeited'],
  network_freeze: ['Hệ số mạng lưới giữ ở ×1,0', 'Network multiplier held at ×1.0'],
  redemption_freeze: ['Tạm khóa đổi thưởng', 'Redemption paused'],
  link_revoked: ['Mất liên kết với khách này', 'Link to this customer ended'],
  strike: ['Ghi một lần vi phạm nghiêm trọng', 'Serious-violation strike'],
  ban: ['Khóa tài khoản thợ vĩnh viễn', 'Worker account banned'],
  withdrawal_hold: ['Tạm giữ rút tiền', 'Withdrawals held'],
  bonus_clawback: ['Thu hồi thưởng chưa rút', 'Un-withdrawn bonus clawed back'],
}

export function violationLabel(code: string, language: AppLanguage): string {
  const label = VIOLATION_LABELS[code]
  return label ? textByLanguage(language, label[0], label[1]) : code
}

export function consequenceLabel(kind: string, language: AppLanguage): string {
  const label = CONSEQUENCE_LABELS[kind]
  return label ? textByLanguage(language, label[0], label[1]) : kind
}

export function caseStatusLabel(item: WorkerViolationCaseView, language: AppLanguage): string {
  if (item.appeal_status === 'overturned') return textByLanguage(language, 'Đã minh oan · khôi phục đầy đủ', 'Cleared · fully restored')
  if (item.appeal_status === 'upheld') return textByLanguage(language, 'Giữ nguyên sau khiếu nại', 'Upheld after appeal')
  if (item.appeal_status === 'submitted') return textByLanguage(language, 'Đang xét khiếu nại', 'Appeal under review')
  if (item.status === 'proposed') {
    return item.suspended_pending_review
      ? textByLanguage(language, 'Đang xác minh · tạm ngừng nhận việc', 'Under review · matching suspended')
      : textByLanguage(language, 'Đang chờ quản trị viên xác minh', 'Waiting for admin review')
  }
  return textByLanguage(language, 'Đã xác nhận', 'Confirmed')
}

export type LevelRule = { level: number; title: string; consequence: string }

// Every number here comes from the live discipline policy row, so an admin change never
// leaves the worker reading a stale rule.
export function levelRules(policy: DisciplinePolicyView, language: AppLanguage): LevelRule[] {
  const vi = language === 'vi'
  return [
    {
      level: 1,
      title: vi ? 'Đến trễ; chậm trả lời dù Kael đã nhắc' : 'Late arrival; slow replies after reminders',
      consequence: vi
        ? `Cảnh cáo, giảm ưu tiên nhận việc ${policy.l1_matching_days} ngày.`
        : `Warning and lower matching priority for ${policy.l1_matching_days} days.`,
    },
    {
      level: 2,
      title: vi ? 'Hủy việc không lý do, không đến, khiếu nại chất lượng đã xác nhận' : 'Cancel without reason, no-show, confirmed complaint',
      consequence: vi
        ? `Trừ ${policy.l2_points_debit} điểm, hệ số giữ ×1,0 trong ${policy.l2_network_freeze_days} ngày.`
        : `Minus ${policy.l2_points_debit} points, multiplier held at ×1.0 for ${policy.l2_network_freeze_days} days.`,
    },
    {
      level: 3,
      title: vi ? 'Giao dịch ngoài app, thu thêm tiền mặt' : 'Off-app dealing, extra cash',
      consequence: vi
        ? `Mất điểm chưa đổi và liên kết với khách đó, khóa đổi thưởng ${policy.l3_freeze_days} ngày. Tái phạm trong ${policy.strike_window_months} tháng: khóa tài khoản.`
        : `Lose unredeemed points and that customer link; redemption paused ${policy.l3_freeze_days} days. Again within ${policy.strike_window_months} months: banned.`,
    },
    {
      level: 4,
      title: vi ? 'Gian lận: khách giả, tự đặt việc, đánh giá hoặc bằng chứng giả' : 'Fraud: fake customers, self-booking, fake reviews or evidence',
      consequence: vi
        ? 'Khóa tài khoản, mất toàn bộ điểm, thu hồi thưởng chưa rút.'
        : 'Account banned, all points forfeited, un-withdrawn bonus clawed back.',
    },
    {
      level: 5,
      title: vi ? 'Gây hại cho khách: trộm, phá hoại, quấy rối, bạo lực, đe dọa, quay lén' : 'Harm to a customer: theft, damage, harassment, violence, threats, covert filming',
      consequence: vi
        ? `Ngừng nhận việc ngay khi có báo cáo đáng tin. Nếu xác minh: khóa vĩnh viễn, chặn đăng ký lại, giữ rút tiền ${policy.withdrawal_hold_days} ngày (lâu hơn chỉ khi cơ quan chức năng đang xử lý).`
        : `Matching paused at once on a credible report. If verified: permanent ban, no re-registration, withdrawals held ${policy.withdrawal_hold_days} days (longer only while an authority handles it).`,
    },
  ]
}
