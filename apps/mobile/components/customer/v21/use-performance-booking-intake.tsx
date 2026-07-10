import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  getMissingRequiredPerformanceQuestions,
  type CustomerServiceId,
  type IntakeAnswers,
  type ServiceType,
} from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'
import {
  buildExistingBookingDraftFromScope,
  buildPerformanceScopeCard,
  productionServiceForBooking,
  scopeServiceLineIdForCustomerService,
} from '@/lib/kael-performance-intake'
import type { CustomerThemeTokens } from '../customer-theme'
import { PerformanceIntakePanel } from './performance-intake-surfaces'

type ResolvedBookingDraft =
  | { ok: true; description: string; problemChips: string[]; serviceType: ServiceType }
  | { ok: false; error: string }

export function usePerformanceBookingIntake({
  language,
  existingMediaCount,
  selectedService,
  setError,
  tokens,
}: {
  language: AppLanguage
  existingMediaCount: number
  selectedService: CustomerServiceId | null
  setError: (value: string | null) => void
  tokens: CustomerThemeTokens
}) {
  const [answers, setAnswers] = useState<IntakeAnswers>({})
  const [photoDrafts, setPhotoDrafts] = useState<LocalMediaUploadDraft[]>([])
  const serviceLineId = scopeServiceLineIdForCustomerService(selectedService)
  const productionServiceType = productionServiceForBooking(selectedService)
  const state = serviceLineId ? { serviceLineId, answers, mediaCount: existingMediaCount + photoDrafts.length } : null
  const submitBlocked = Boolean(serviceLineId && !productionServiceType)
  const submitLabel = submitBlocked
    ? (language === 'vi' ? 'Xem trước phạm vi · Chưa mở đặt lịch' : 'Scope preview · Booking not open')
    : serviceLineId
      ? (language === 'vi' ? 'Gửi phạm vi cho Kael' : 'Send scope to Kael')
      : null

  const panel = state ? (
    <PerformanceIntakePanel
      language={language}
      onAnswerChange={(questionId, value) => {
        setAnswers((current) => ({ ...current, [questionId]: value }))
        setError(null)
      }}
      onAddPhotos={async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!permission.granted) return setError(language === 'vi' ? 'Cho phép truy cập thư viện để thêm ảnh hiện trạng.' : 'Allow photo-library access to add current-condition photos.')
        const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ['images'], quality: 0.82, selectionLimit: Math.max(1, 5 - existingMediaCount - photoDrafts.length) })
        if (result.canceled) return
        setPhotoDrafts((current) => mergePhotoDrafts(current, result.assets.map(photoDraftFromPickerAsset)))
        setError(null)
      }}
      photoCount={state.mediaCount}
      state={state}
      tokens={tokens}
    />
  ) : undefined

  const resolveDraft = ({
    fallbackDescription,
    fallbackProblemChips,
  }: {
    fallbackDescription: string
    fallbackProblemChips: string[]
  }): ResolvedBookingDraft => {
    if (state) {
      if (getMissingRequiredPerformanceQuestions(state).length > 0) {
        return { ok: false, error: language === 'vi' ? 'Hoàn tất các thông tin bắt buộc trước khi gửi Kael.' : 'Complete the required scope details before continuing.' }
      }
      const scopeCard = buildPerformanceScopeCard(state)
      const scopeDraft = buildExistingBookingDraftFromScope(scopeCard, language)
      if (!scopeDraft) {
        return { ok: false, error: language === 'vi' ? scopeCard.bookingBlockerVi ?? 'Dịch vụ đang ở chế độ xem trước.' : scopeCard.bookingBlockerEn ?? 'This service is in scope-preview mode.' }
      }
      return { ok: true, description: scopeDraft.description, problemChips: [...scopeDraft.problemChips], serviceType: scopeDraft.serviceType }
    }
    if (!productionServiceType) return { ok: false, error: language === 'vi' ? 'Dịch vụ này chưa mở đặt lịch.' : 'This service is not open for booking yet.' }
    if (fallbackDescription.trim().length < 10) return { ok: false, error: language === 'vi' ? 'Mô tả cần rõ hơn trước khi gửi Kael.' : 'Add a clearer description before sending to Kael.' }
    return { ok: true, description: fallbackDescription.trim(), problemChips: fallbackProblemChips, serviceType: productionServiceType }
  }

  return {
    panel,
    photoDrafts,
    productionServiceType,
    reset: () => {
      setAnswers({})
      setPhotoDrafts([])
    },
    resolveDraft,
    serviceLineId,
    state,
    submitBlocked,
    submitLabel,
  }
}

function mergePhotoDrafts(current: LocalMediaUploadDraft[], incoming: LocalMediaUploadDraft[]) {
  const unique = new Map(current.map((draft) => [draft.uri, draft]))
  incoming.forEach((draft) => unique.set(draft.uri, draft))
  return [...unique.values()].slice(0, 5)
}

function photoDraftFromPickerAsset(asset: ImagePicker.ImagePickerAsset): LocalMediaUploadDraft {
  return {
    fileName: asset.fileName ?? undefined,
    fileSizeBytes: asset.fileSize,
    mimeType: asset.mimeType ?? undefined,
    type: 'image',
    uri: asset.uri,
  }
}
