import type { LocalDeal } from '@nestscout/shared'
import { StyleSheet, Text, View } from 'react-native'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ServiceCopy } from '../ui/copy'
import { formatVnd } from './case-work-money-display-model'

// What the customer booked, what it costs, and Kael's one-line read of the problem. Each line shows
// only what the job really carries, so a missing price or note is left out, never filled in.
export function MatchedJobSummary({
  deal,
  language,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const vi = language === 'vi'
  const serviceType = deal.draft.serviceType
  const service = serviceType ? customerV21ServiceCopy[language][serviceType]?.label ?? null : null
  const problem = deal.draft.problemChips[0]?.trim() || null
  const headline = [service, problem].filter(Boolean).join(' · ')
  const price = deal.finalPrice != null
    ? { label: vi ? 'Giá đã chốt' : 'Agreed price', value: formatVnd(deal.finalPrice, language) }
    : deal.estimate?.priceRangeLabel
      ? { label: vi ? 'Giá ước tính' : 'Estimated price', value: deal.estimate.priceRangeLabel }
      : null
  const note = deal.kaelProblem?.trim() || null
  if (!headline && !price && !note) return null

  return (
    <View style={[styles.section, { borderTopColor: tokens.border }]} testID="customer-v21-matched-job-summary">
      <Text style={[styles.label, { color: tokens.muted }]}>{vi ? 'Công việc của bạn' : 'Your job'}</Text>
      {headline ? <Text style={[styles.headline, { color: tokens.text }]}>{headline}</Text> : null}
      {price ? (
        <View style={styles.priceRow} testID="customer-v21-matched-job-price">
          <Text style={[styles.price, { color: tokens.text }]}>{price.value}</Text>
          <Text style={[styles.priceLabel, { color: tokens.muted }]}>{price.label}</Text>
        </View>
      ) : null}
      {note ? (
        <Text style={[styles.note, { color: tokens.muted }]} testID="customer-v21-matched-job-kael-note">
          <Text style={{ color: tokens.primary, fontWeight: '600' }}>{vi ? 'Kael ghi nhận: ' : 'Kael noted: '}</Text>
          {note}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  headline: { ...typography.subheadline, fontWeight: '600' },
  label: { ...typography.footnote, fontWeight: '600' },
  note: { ...typography.footnote },
  price: { ...typography.title3, fontWeight: '600' },
  priceLabel: { ...typography.footnote },
  priceRow: { alignItems: 'baseline', columnGap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  section: { borderTopWidth: StyleSheet.hairlineWidth, gap: 6, marginTop: 6, paddingTop: 14 },
})
