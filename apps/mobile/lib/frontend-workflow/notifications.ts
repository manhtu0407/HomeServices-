import type { NotificationListResponse } from '../api-types'

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

export function sameNotifications(
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
