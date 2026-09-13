import { useState } from 'react'
import { Text, View } from 'react-native'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { ApartmentAccessView } from '@/lib/frontend-workflow/use-customer-apartment-access'
import type { CustomerThemeTokens } from '../customer-theme'

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
    <View>
      {scoped?.message ? (
        <Text accessibilityLiveRegion="polite" style={{ color: tokens.text }} testID="customer-v21-case-apartment-access-feedback">
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
        size="small"
        testID="customer-v21-case-authorize-apartment-access"
      />
    </View>
  )
}
