import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import {
  CompensationNegotiationPanel,
  compensationFailureCopy,
  formatCompensationVnd,
} from '@/components/job/compensation-negotiation'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useCachedResource } from '@/lib/resource-cache/use-cached-resource'
import { compensationService, type WorkerCompensation } from '@/lib/services/compensation-service'

import { textByLanguage } from '../ui/format'
import { styles } from './violation-styles'
import { violationLabel } from './violation-copy'

const palette = { text: color.text.strong, muted: color.text.secondary, border: color.surface.stroke, accent: color.text.strong }

// A customer's compensation request reaches the worker here, next to the case it comes from.
// Nothing leaves the worker's balance until the worker has pressed accept on an amount. A failed
// load shows a retry row, so a pending request with a deadline is never hidden by a network error.
export function WorkerCompensationSection({ language }: { language: AppLanguage }) {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? ''
  const fetchCompensation = useCallback(async () => {
    const result = await compensationService.listForWorker(accessToken)
    if (!result.success) console.warn('worker compensation load failed', { code: result.code, status: result.status })
    return result
  }, [accessToken])
  const compensation = useCachedResource({
    enabled: Boolean(accessToken),
    fetcher: fetchCompensation,
    key: 'worker.compensation',
    ownerId: session?.user.id ?? null,
  })
  const data = compensation.data
  const loadFailed = compensation.status === 'error'
  const load = compensation.refresh

  if (!data && loadFailed) {
    return (
      <View style={styles.card} testID="worker-v5-compensation-unavailable">
        <Text style={styles.sectionTitle}>{textByLanguage(language, 'Chưa tải được đề nghị bồi thường', 'Compensation requests did not load')}</Text>
        <Pressable accessibilityRole="button" onPress={() => void load()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="worker-v5-compensation-retry">
          <Text style={styles.secondaryLabel}>{textByLanguage(language, 'Thử lại', 'Try again')}</Text>
        </Pressable>
      </View>
    )
  }
  if (!data || data.negotiations.length === 0) return null
  return (
    <View style={styles.stack} testID="worker-v5-compensation">
      {data.negotiations.map((negotiation) => (
        <View key={negotiation.id} style={styles.card} testID={`worker-v5-compensation-${negotiation.id}`}>
          <Text style={styles.sectionTitle}>
            {textByLanguage(language, 'Khách đề nghị bồi thường', 'Compensation request')}
          </Text>
          <Text style={styles.sectionHint}>
            {textByLanguage(
              language,
              `${violationLabel(negotiation.violation_code, 'vi')} · Số dư ${formatCompensationVnd(data.withdrawable_vnd, language)}. Bạn chỉ trả khi tự bấm đồng ý.`,
              `${violationLabel(negotiation.violation_code, 'en')} · Balance ${formatCompensationVnd(data.withdrawable_vnd, language)}. You pay only if you accept.`,
            )}
          </Text>
          <View style={local.panel}>
            <CompensationNegotiationPanel
              language={language}
              maxOfferVnd={data.withdrawable_vnd}
              negotiation={negotiation}
              onRespond={async (input) => {
                const result = await compensationService.respondAsWorker(negotiation.id, input, accessToken)
                if (!result.success) return compensationFailureCopy(result, language)
                await load()
                return null
              }}
              palette={palette}
              policy={data.policy}
              side="worker"
              testID={`worker-v5-compensation-${negotiation.id}-negotiation`}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

// The panel opens with the same 8px it keeps between its own rows, so the photos sit centred
// between the hint above and the first offer below.
const local = StyleSheet.create({
  panel: {
    marginTop: 8,
  },
})
