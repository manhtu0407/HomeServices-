import type { NotificationListResponse } from '../api-types'

// Discipline and compensation notices are written in Vietnamese by the database, which has no
// per-user language; English mode renders them from the event type instead.
const programNotificationEnglish: Record<string, { title: string; body: string }> = {
  violation_confirmed: { title: 'Violation confirmed', body: 'See the reason and consequences in Rules & violations. You can appeal with evidence.' },
  violation_confirmed_customer: { title: 'Your report was confirmed', body: 'If you lost money or property, you can ask the worker for compensation in History.' },
  violation_appeal_upheld: { title: 'Appeal not accepted', body: 'The decision stands. See the reason in Rules & violations.' },
  violation_appeal_overturned: { title: 'Appeal accepted', body: 'Your points, rank and related benefits have been restored.' },
  withdrawal_hold_extended: { title: 'Withdrawal hold extended', body: 'An authority is handling the case, so withdrawals stay on hold. See Rules & violations.' },
  compensation_claim_received: { title: 'Compensation request', body: 'The customer asked for compensation. Accept, counter or decline in Rules & violations before the deadline.' },
  compensation_counter_offer: { title: 'New compensation offer', body: 'The other side proposed a different amount. Reply before the deadline.' },
  compensation_agreed: { title: 'Compensation agreed', body: 'Both sides agreed on the amount. NestScout handles the transfer.' },
  compensation_declined: { title: 'No compensation agreement', body: 'The other side declined. The case can be taken to the authorities.' },
  compensation_paid: { title: 'Compensation transferred', body: 'The agreed compensation has been transferred.' },
  worker_reply_nudge: { title: 'A customer is waiting', body: 'The customer messaged in the job room. Reply soon.' },
}

/** RFQ workflow notifications are localized from the event, never from arbitrary server text. */
export function localizeRfqNotification<T extends { event_type: string; title: string; body: string }>(notification: T, language: 'vi' | 'en'): T {
  const texts: Record<string, Record<'vi' | 'en', { title: string; body: string }>> = {
    rfq_price_proposed: {
      vi: { title: 'Báo giá sau khảo sát', body: 'Thợ đã gửi báo giá. Vui lòng xem và xác nhận trước khi bắt đầu công việc.' },
      en: { title: 'Post-inspection quote', body: 'The worker sent a quote. Review and approve it before work starts.' },
    },
    rfq_price_approved: {
      vi: { title: 'Khách đã đồng ý báo giá', body: 'Khách đã xác nhận phạm vi và tổng giá. Bạn có thể tiếp tục công việc.' },
      en: { title: 'Quote approved', body: 'The customer approved the scope and exact total. You may continue work.' },
    },
    rfq_price_rejected: {
      vi: { title: 'Khách chưa đồng ý báo giá', body: 'Hãy trao đổi lại với khách trước khi gửi báo giá mới hoặc bắt đầu công việc.' },
      en: { title: 'Quote not agreed', body: 'Discuss with the customer before sending another quote or starting work.' },
    },
  }
  const value = texts[notification.event_type]?.[language]
    ?? (language === 'en' ? programNotificationEnglish[notification.event_type] : undefined)
  return value ? { ...notification, ...value } : notification
}

type NotificationState = {
  notifications: NotificationListResponse['notifications']
  unreadCount: number
}

type NotificationStateAction =
  | { type: 'mark_read'; notificationId: string; readAt: string; shouldDecrementUnread: boolean }
  | { type: 'refresh'; notifications: NotificationListResponse['notifications']; unreadCount: number }
  | { type: 'reset' }

export const initialNotificationState: NotificationState = {
  notifications: [],
  unreadCount: 0,
}

export function notificationStateReducer(state: NotificationState, action: NotificationStateAction): NotificationState {
  switch (action.type) {
    case 'mark_read': {
      const notifications = markNotificationListRead(state.notifications, action.notificationId, action.readAt)
      const unreadCount = action.shouldDecrementUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
      return notifications === state.notifications && unreadCount === state.unreadCount
        ? state
        : { notifications, unreadCount }
    }
    case 'refresh':
      return sameNotifications(state.notifications, action.notifications) && state.unreadCount === action.unreadCount
        ? state
        : { notifications: action.notifications, unreadCount: action.unreadCount }
    case 'reset':
      return state.notifications.length === 0 && state.unreadCount === 0 ? state : initialNotificationState
    default:
      return state
  }
}

function sameNotifications(
  left: NotificationListResponse['notifications'],
  right: NotificationListResponse['notifications'],
) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index]
    return item.id === next.id
      && item.title === next.title
      && item.body === next.body
      && item.event_type === next.event_type
      && item.status === next.status
      && item.job_id === next.job_id
      && item.created_at === next.created_at
      && item.read_at === next.read_at
  })
}

export function markNotificationListRead(
  notifications: NotificationListResponse['notifications'],
  notificationId: string,
  readAt: string,
) {
  let changed = false
  const next = notifications.map((item) => {
    if (item.id !== notificationId) return item
    changed = item.status !== 'read' || item.read_at !== readAt
    return changed ? { ...item, status: 'read' as const, read_at: readAt } : item
  })
  return changed ? next : notifications
}
