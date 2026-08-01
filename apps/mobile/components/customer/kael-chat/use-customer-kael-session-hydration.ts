import { useEffect, useRef, type MutableRefObject } from 'react'
import type { ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestRef,
} from '@/lib/client-request-id'
import { cleanupKaelChatMediaRefs, uploadKaelChatMediaDrafts } from '@/lib/media-upload'
import { kaelChatService } from '@/lib/services'

import {
  clearPendingKaelChatDraft,
  readPendingKaelChatDraft,
  setPendingKaelChatDraft,
} from './pending-intake'
import { localizeKaelRequestFailure } from './customer-kael-chat-helpers'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import type { CustomerKaelMode } from '../ui/types'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'

type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type PendingDraft = NonNullable<Conversation['pendingDraft']>
type SuccessfulPendingDraftUpload = Extract<
  Awaited<ReturnType<typeof uploadKaelChatMediaDrafts>>,
  { success: true }
>
type FailedPendingDraftUpload = Exclude<
  Awaited<ReturnType<typeof uploadKaelChatMediaDrafts>>,
  SuccessfulPendingDraftUpload
>
type PendingDraftCreateResult =
  | Awaited<ReturnType<typeof kaelChatService.create>>
  | FailedPendingDraftUpload
type PendingDraftCreateRequest = {
  fingerprint: string
  ownerKey: string
  promise: Promise<PendingDraftCreateResult> | null
  requestRef: PendingClientRequestRef
  upload: SuccessfulPendingDraftUpload | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function pendingDraftCreateFingerprint(input: {
  draft: PendingDraft
  language: AppLanguage
  message: string
  serviceType: ServiceType
}) {
  const { draft, language, message, serviceType } = input
  return JSON.stringify({
    address_district: draft.districtLabel ?? null,
    address_label: draft.addressLabel ?? null,
    intake_description: draft.description ?? null,
    intake_source: 'booking',
    language,
    local_media: (draft.photoDrafts ?? []).map((item) => ({
      duration_millis: item.durationMillis ?? null,
      file_name: item.fileName ?? null,
      file_size_bytes: item.fileSizeBytes ?? null,
      mime_type: item.mimeType ?? null,
      type: item.type,
      uri: item.uri,
    })),
    message,
    problem_chips: draft.problemChips ?? [],
    profile_id: draft.profileId,
    schedule_window: draft.scheduleWindow ?? null,
    scheduled_at: draft.scheduledAt,
    service_type: serviceType,
  })
}

function pendingDraftRequestRef(draft: PendingDraft, fingerprint: string): PendingClientRequestRef {
  const persistedId = draft.clientRequestId?.trim()
  const persistedFingerprint = draft.clientRequestFingerprint
  const canReusePersistedId = Boolean(
    persistedId &&
    UUID_PATTERN.test(persistedId) &&
    (!persistedFingerprint || persistedFingerprint === fingerprint),
  )
  return {
    current: canReusePersistedId && persistedId
      ? { fingerprint, id: persistedId }
      : null,
  }
}

function unattachedMediaRefs(
  upload: SuccessfulPendingDraftUpload,
  turns: { media_refs: string[] }[],
) {
  const attachedRefs = new Set(turns.flatMap((turn) => turn.media_refs))
  return upload.mediaRefs.filter((mediaRef) => !attachedRefs.has(mediaRef))
}

export function useCustomerKaelSessionHydration({
  conversation,
  kaelRequestGuard,
  language,
  onCaseSessionReady,
  pendingDraftLocalizedMessage,
  pendingDraftOwnerId,
  routeJobId,
  routeMode,
  routeSessionId,
  selectedServiceRef,
  sessionAccessToken,
}: {
  conversation: Conversation
  kaelRequestGuard: CustomerKaelRequestGuard
  language: AppLanguage
  onCaseSessionReady: (caseSessionId: string) => Promise<unknown>
  pendingDraftLocalizedMessage: string | null | undefined
  pendingDraftOwnerId: string | null
  routeJobId: string | null
  routeMode: CustomerKaelMode
  routeSessionId: string | null
  selectedServiceRef: MutableRefObject<ServiceType | null>
  sessionAccessToken: string | undefined
}) {
  const pendingCreateRef = useRef<PendingDraftCreateRequest | null>(null)
  const {
    beginHydration,
    hydratePendingDraft,
    pendingDraft,
    rejectHydration,
    resolveHydration,
  } = conversation
  const pendingDraftReadKey = `${pendingDraftOwnerId ?? ''}:${routeMode}:${routeJobId ?? ''}:${routeSessionId ?? ''}`
  const hydratedPendingDraftKeyRef = useRef<string | null>(
    pendingDraft ? pendingDraftReadKey : null,
  )

  useEffect(() => {
    if (
      !pendingDraftOwnerId ||
      pendingDraft ||
      routeJobId ||
      routeSessionId ||
      hydratedPendingDraftKeyRef.current === pendingDraftReadKey
    ) return
    let cancelled = false
    readPendingKaelChatDraft(pendingDraftOwnerId).then((draft) => {
      if (cancelled || !draft) return
      hydratedPendingDraftKeyRef.current = pendingDraftReadKey
      selectedServiceRef.current = draft.serviceType
      hydratePendingDraft(draft, Boolean(draft.serviceType && sessionAccessToken))
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [hydratePendingDraft, pendingDraft, pendingDraftOwnerId, pendingDraftReadKey, routeJobId, routeSessionId, selectedServiceRef, sessionAccessToken])

  useEffect(() => {
    if (routeSessionId && sessionAccessToken) {
      const requestToken = kaelRequestGuard.begin('conversation')
      beginHydration()
      kaelChatService.get(routeSessionId, sessionAccessToken)
        .then((result) => {
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (result.success) {
            selectedServiceRef.current = result.data.session.service_type
            resolveHydration(result.data, false)
          } else {
            rejectHydration(localizeKaelRequestFailure(result, language))
          }
        })
        .catch(() => {
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          rejectHydration(language === 'vi' ? 'Kael tạm thời chưa phản hồi.' : 'Kael is temporarily unavailable.')
        })
      return () => {
        kaelRequestGuard.cancel(requestToken)
      }
    }

    const pendingServiceType = pendingDraft?.serviceType
    if (pendingServiceType && sessionAccessToken && !routeJobId && !routeSessionId) {
      hydratedPendingDraftKeyRef.current = pendingDraftReadKey
      const requestToken = kaelRequestGuard.begin('conversation')
      const pendingDraftDescription = pendingDraftLocalizedMessage ?? pendingDraft.message
      const requestFingerprint = pendingDraftCreateFingerprint({
        draft: pendingDraft,
        language,
        message: pendingDraftDescription,
        serviceType: pendingServiceType,
      })
      const requestOwnerKey = pendingDraftOwnerId ?? ''
      let pendingCreate = pendingCreateRef.current
      if (
        !pendingCreate ||
        pendingCreate.fingerprint !== requestFingerprint ||
        pendingCreate.ownerKey !== requestOwnerKey
      ) {
        pendingCreate = {
          fingerprint: requestFingerprint,
          ownerKey: requestOwnerKey,
          promise: null,
          requestRef: pendingDraftRequestRef(pendingDraft, requestFingerprint),
          upload: null,
        }
        pendingCreateRef.current = pendingCreate
      }
      beginHydration()
      const createFromBasicIntake = async () => {
        const clientRequestId = stableClientRequestId(pendingCreate.requestRef, requestFingerprint)
        if (
          pendingDraftOwnerId &&
          (
            pendingDraft.clientRequestId !== clientRequestId ||
            pendingDraft.clientRequestFingerprint !== requestFingerprint
          )
        ) {
          void setPendingKaelChatDraft(pendingDraftOwnerId, {
            ...pendingDraft,
            clientRequestFingerprint: requestFingerprint,
            clientRequestId,
          }).catch(() => undefined)
        }
        let uploaded = pendingCreate.upload
        if (uploaded === null) {
          const uploadResult = await uploadKaelChatMediaDrafts(pendingDraft.photoDrafts ?? [])
          if (!uploadResult.success) return uploadResult
          uploaded = uploadResult
          pendingCreate.upload = uploaded
        }
        const created = await kaelChatService.create({
          address_district: pendingDraft.districtLabel ?? undefined,
          address_label: pendingDraft.addressLabel,
          client_request_id: clientRequestId,
          evidence_items: uploaded.evidenceItems,
          intake_description: pendingDraft.description,
          intake_source: 'booking',
          language,
          message: pendingDraftDescription,
          problem_chips: pendingDraft.problemChips ?? [],
          photo_urls: uploaded.urls,
          profileId: pendingDraft.profileId,
          scheduledAt: pendingDraft.scheduledAt,
          scheduleWindow: pendingDraft.scheduleWindow,
          service_type: pendingServiceType,
        })
        if (!created.success) {
          if (!shouldRetainClientRequestId(created)) {
            await cleanupKaelChatMediaRefs(uploaded.mediaRefs)
            clearStableClientRequestId(pendingCreate.requestRef, requestFingerprint)
            pendingCreate.upload = null
            if (pendingCreateRef.current === pendingCreate) pendingCreateRef.current = null
          }
          return created
        }
        const unusedMediaRefs = unattachedMediaRefs(uploaded, created.data.turns)
        if (unusedMediaRefs.length > 0) await cleanupKaelChatMediaRefs(unusedMediaRefs)
        clearStableClientRequestId(pendingCreate.requestRef, requestFingerprint)
        if (pendingCreateRef.current === pendingCreate) pendingCreateRef.current = null
        return created
      }
      if (!pendingCreate.promise) {
        const sharedPromise = createFromBasicIntake()
        pendingCreate.promise = sharedPromise
        void sharedPromise.then(
          () => {
            if (pendingCreate.promise === sharedPromise) pendingCreate.promise = null
          },
          () => {
            if (pendingCreate.promise === sharedPromise) pendingCreate.promise = null
          },
        )
      }
      const sharedCreate = pendingCreate.promise
      sharedCreate
        .then((result) => {
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (result.success) {
            selectedServiceRef.current = result.data.session.service_type
            resolveHydration(result.data, true)
            if (
              pendingDraftOwnerId &&
              result.data.session.intake_confirmation?.status !== 'pending'
            ) {
              void clearPendingKaelChatDraft(pendingDraftOwnerId)
            }
            // The authoritative Agentic response is ready now. Catalog synchronization is
            // menu metadata and must not hold the first usable Case Work session hostage.
            void onCaseSessionReady(result.data.session.id).catch(() => undefined)
          } else {
            rejectHydration(localizeKaelRequestFailure(result, language))
          }
        })
        .catch(() => {
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          rejectHydration(language === 'vi' ? 'Kael tạm thời chưa phản hồi.' : 'Kael is temporarily unavailable.')
        })
      return () => {
        kaelRequestGuard.cancel(requestToken)
      }
    }
    return undefined
  }, [beginHydration, kaelRequestGuard, language, onCaseSessionReady, pendingDraft, pendingDraftLocalizedMessage, pendingDraftOwnerId, pendingDraftReadKey, rejectHydration, resolveHydration, routeJobId, routeSessionId, selectedServiceRef, sessionAccessToken])
}
