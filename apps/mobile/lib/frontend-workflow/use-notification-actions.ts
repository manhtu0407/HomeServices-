import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { UserRole } from '@nestscout/shared'
import type { NotificationListResponse } from '../api-types'
import { notificationService } from '../services'
import { isAppForeground } from './helpers'
import {
  initialNotificationState,
  markNotificationListRead,
  notificationStateReducer,
} from './notifications'

type NotificationActionsInput = {
  role: UserRole | null
  sessionUserId: string | null
  setRemoteError: (error: string) => false
}

export function useNotificationActions({ role, sessionUserId, setRemoteError }: NotificationActionsInput) {
  const [notificationState, setNotificationState] = useReducer(notificationStateReducer, initialNotificationState)
  const { notifications, unreadCount: notificationUnreadCount } = notificationState
  const notificationsRef = useRef<NotificationListResponse['notifications']>([])
  const locallyReadNotificationIdsRef = useRef<Set<string> | null>(null)
  const refreshInFlightRef = useRef(false)
  if (locallyReadNotificationIdsRef.current === null) {
    locallyReadNotificationIdsRef.current = new Set<string>()
  }

  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  const refreshNotifications = useCallback(async () => {
    if (!sessionUserId || !role) return true
    if (refreshInFlightRef.current) return true
    refreshInFlightRef.current = true
    try {
      const result = await notificationService.list()
      if (!result.success) return setRemoteError(result.error)
      notificationsRef.current = result.data.notifications
      const readNotificationIds = new Set<string>()
      for (const item of result.data.notifications) {
        if (item.status === 'read') readNotificationIds.add(item.id)
      }
      locallyReadNotificationIdsRef.current = readNotificationIds
      setNotificationState({
        type: 'refresh',
        notifications: result.data.notifications,
        unreadCount: result.data.unread_count,
      })
      return true
    } finally {
      refreshInFlightRef.current = false
    }
  }, [role, sessionUserId, setRemoteError])

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const result = await notificationService.markRead(notificationId)
    if (!result.success) return setRemoteError(result.error)
    const currentNotification = notificationsRef.current.find((item) => item.id === notificationId)
    const shouldDecrementUnread = Boolean(
      currentNotification &&
      currentNotification.status !== 'read' &&
      !locallyReadNotificationIdsRef.current!.has(notificationId),
    )
    locallyReadNotificationIdsRef.current!.add(notificationId)
    notificationsRef.current = markNotificationListRead(notificationsRef.current, notificationId, result.data.read_at)
    setNotificationState({
      type: 'mark_read',
      notificationId,
      readAt: result.data.read_at,
      shouldDecrementUnread,
    })
    return true
  }, [setRemoteError])

  useEffect(() => {
    setNotificationState({ type: 'reset' })
  }, [sessionUserId])

  useEffect(() => {
    if (!sessionUserId || !role) return
    if (isAppForeground()) void refreshNotifications()
    const interval = setInterval(() => {
      if (isAppForeground()) void refreshNotifications()
    }, 60_000)
    return () => clearInterval(interval)
  }, [refreshNotifications, role, sessionUserId])

  return {
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    markNotificationRead,
  }
}
