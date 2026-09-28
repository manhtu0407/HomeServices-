import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import {
  CompensationNegotiationPanel,
  compensationFailureCopy,
  formatCompensationVnd,
} from '@/components/job/compensation-negotiation'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { compensationService, type WorkerCompensation } from '@/lib/services/compensation-service'

import { textByLanguage } from '../ui/format'
import { styles } from './violation-styles'
import { violationLabel } from './violation-copy'

const palette = { text: color.text.strong, muted: color.text.secondary, border: color.surface.stroke, accent: color.text.strong }

// A customer's compensation request reaches the worker here, next to the case it comes from.
// Nothing leaves the worker's balance until the worker has pressed accept on an amount.
export function WorkerCompensationSection({ language }: { language: AppLanguage }) {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? ''
  const [data, setData] = useState<WorkerCompensation | null>(null)

  const load = useCallback(async () => {
    const result = await compensationService.listForWorker(accessToken)
    if (result.success) setData(result.data)
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

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
