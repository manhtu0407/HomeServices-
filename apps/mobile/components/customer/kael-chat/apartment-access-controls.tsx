import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { typography } from '@/design/theme'
import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { ApartmentAccessView } from '@/lib/frontend-workflow/use-customer-apartment-access'
import type { LocalWorkerProfileSummary } from '@nestscout/shared'
import type { CustomerThemeTokens } from '../customer-theme'
import { formatShortClockTime } from './case-work-money-display-model'
import { kaelActionPrimaryStyle } from './kael-next-action-chips'
import { WorkerIdentitySummary } from './worker-identity-summary'

// Who is waiting in the lobby and when they checked in, so "release the unit" is a decision about a
// person the customer can see rather than a bare button.
export function ApartmentAccessDetails({ checkedInAt, language, photoRefs = [], tokens, worker }: {
  checkedInAt: string | null
  language: AppLanguage
  photoRefs?: readonly string[]
  tokens: CustomerThemeTokens
  worker: LocalWorkerProfileSummary
}) {
  const clock = formatShortClockTime(checkedInAt, language)
  return (
    <>
    <WorkerIdentitySummary
      identity={{
        avatarUrl: worker.avatarUrl,
        birthYear: worker.birthYear,
        displayName: worker.fullName,
        gender: worker.gender,
        rating: worker.rating,
        totalJobs: worker.totalJobs,
        yearsExperience: worker.yearsExperience,
      }}
      language={language}
      testIDPrefix="customer-v21-apartment-access-worker"
      tokens={tokens}
    />
    {photoRefs.length > 0 ? (
      <JobEvidenceGallery
        language={language}
        refs={photoRefs}
        stageLabel={language === 'vi' ? 'Ảnh thợ chụp tại sảnh' : 'Worker\'s lobby photo'}
        testID="customer-v21-apartment-access-photos"
      />
    ) : null}
    {clock ? (
      <Text style={[styles.checkIn, { color: tokens.muted }]} testID="customer-v21-case-apartment-access-checkin">
        {language === 'vi' ? `Ảnh xác nhận có mặt tại sảnh lúc ${clock}` : `Lobby photo check-in at ${clock}`}
      </Text>
    ) : null}
    </>
  )
}

export function ApartmentAccessControls({ jobId, state, language, onAuthorize, tokens }: {
  jobId: string
  state: ApartmentAccessView
  language: AppLanguage
  onAuthorize: () => Promise<void> | void
  tokens: CustomerThemeTokens
}) {
  const [submitting, setSubmitting] = useState(false)
  const scoped = state?.jobId === jobId ? state : null
  const busy = submitting || scoped?.pending === true
  const disabled = busy || !scoped?.ready
  return (
    <View style={styles.controls}>
      {scoped?.message ? (
        <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: tokens.text }]} testID="customer-v21-case-apartment-access-feedback">
          {scoped.message}
        </Text>
      ) : null}
      <KaelButton
        accessibilityState={{ busy, disabled }}
        disabled={disabled}
        label={scoped?.pending ? (language === 'vi' ? 'Đang đối soát' : 'Reconciling')
          : submitting ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming')
            : (language === 'vi' ? 'Cho thợ lên' : 'Release unit access')}
        onPress={() => {
          if (disabled) return
          setSubmitting(true)
          // The workflow owns error reporting and retains unknown outcomes.
          void Promise.resolve().then(onAuthorize).catch(() => undefined).finally(() => setSubmitting(false))
        }}
        style={kaelActionPrimaryStyle}
        testID="customer-v21-case-authorize-apartment-access"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  checkIn: { ...typography.footnote },
  controls: { alignSelf: 'stretch', gap: 12 },
  feedback: { ...typography.footnote },
})
