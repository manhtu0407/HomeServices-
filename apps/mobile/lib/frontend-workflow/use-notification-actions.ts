import type { WorkflowErrorHandler } from './errors'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { UserRole } from '@nestscout/shared'
import type { NotificationListResponse } from '../api-types'
import { setRecoveryProbe } from '../connectivity'
import { readResource, writeResource } from '../resource-cache/resource-cache'
import { hydrateResourceOwner } from '../resource-cache/resource-cache-persistence'
import { notificationService } from '../services'

const NOTIFICATIONS_RESOURCE_KEY = 'notifications'
import { isAppForeground } from './helpers'
import {
  initialNotificationState,
  markNotificationListRead,
  notificationStateReducer,
} from './notifications'

type NotificationActionsInput = {
  role: UserRole | null
  sessionUserId: string | null
  setRemoteError: WorkflowErrorHandler
}

export function useNotificationActions({ role, sessionUserId, setRemoteError }: NotificationActionsInput) {
  const [notificationState, setNotificationState] = useReducer(notificationStateReducer, initialNotificationState)
  const { notifications, unreadCount: notificationUnreadCount } = notificationState
  const notificationsRef = useRef<NotificationListResponse['notifications']>([])
  const locallyReadNotificationIdsRef = useRef<Set<string> | null>(null)
  const refreshInFlightRef = useRef(false)
  const serverAnsweredRef = useRef(false)
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
      if (!result.success) return setRemoteError(result)
      notificationsRef.current = result.data.notifications
      const readNotificationIds = new Set<string>()
      for (const item of result.data.notifications) {
        if (item.status === 'read') readNotificationIds.add(item.id)
      }
      locallyReadNotificationIdsRef.current = readNotificationIds
      serverAnsweredRef.current = true
      writeResource(sessionUserId, NOTIFICATIONS_RESOURCE_KEY, result.data)
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
    if (!result.success) return setRemoteError(result)
    const currentNotification = notificationsRef.current.find((item) => item.id === notificationId)
    const shouldDecrementUnread = Boolean(
      currentNotification &&
      currentNotification.status !== 'read' &&
      !locallyReadNotificationIdsRef.current!.has(notificationId),
    )
    locallyReadNotificationIdsRef.current!.add(notificationId)
    notificationsRef.current = markNotificationListRead(notificationsRef.current, notificationId, result.data.read_at)
    if (sessionUserId) {
      const cached = readResource<NotificationListResponse>(sessionUserId, NOTIFICATIONS_RESOURCE_KEY)
      if (cached) {
        writeResource(sessionUserId, NOTIFICATIONS_RESOURCE_KEY, {
          ...cached.data,
          notifications: markNotificationListRead(cached.data.notifications, notificationId, result.data.read_at),
          unread_count: shouldDecrementUnread ? Math.max(0, cached.data.unread_count - 1) : cached.data.unread_count,
        }, cached.fetchedAt)
      }
    }
    setNotificationState({
      type: 'mark_read',
      notificationId,
      readAt: result.data.read_at,
      shouldDecrementUnread,
    })
    return true
  }, [sessionUserId, setRemoteError])

  useEffect(() => {
    setNotificationState({ type: 'reset' })
    serverAnsweredRef.current = false
    if (!sessionUserId) return
    let cancelled = false
    // The last list paints the bell and unread badge at launch; the first server answer replaces it.
    void hydrateResourceOwner(sessionUserId).then(() => {
      const cached = readResource<NotificationListResponse>(sessionUserId, NOTIFICATIONS_RESOURCE_KEY)
      if (cancelled || serverAnsweredRef.current || !cached) return
      notificationsRef.current = cached.data.notifications
      setNotificationState({ type: 'refresh', notifications: cached.data.notifications, unreadCount: cached.data.unread_count })
    })
    return () => {
      cancelled = true
    }
  }, [sessionUserId])

  useEffect(() => {
    if (!sessionUserId || !role) return
    if (isAppForeground()) void refreshNotifications()
    const interval = setInterval(() => {
      if (isAppForeground()) void refreshNotifications()
    }, 60_000)
    return () => clearInterval(interval)
  }, [refreshNotifications, role, sessionUserId])

  useEffect(() => {
    if (!sessionUserId || !role) return
    // Probe quietly: a failed probe is expected while offline and must not raise an error on every tick.
    return setRecoveryProbe(async () => {
      const probe = await notificationService.list()
      if (probe.success) void refreshNotifications()
    })
  }, [refreshNotifications, role, sessionUserId])

  return {
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    markNotificationRead,
  }
}
