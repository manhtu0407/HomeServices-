import type { NotificationListResponse } from '../api-types'

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
