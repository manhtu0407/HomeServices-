import type { KaelChatTurn } from '@nestscout/shared'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CASE_WORK_CONTENT_INSET, CASE_WORK_RAIL_PADDING, CASE_WORK_ROW_STYLE, caseWorkAccentLine } from './case-work-response'
import { formatReferenceUnit } from './kael-next-actions-display-model'

type ReferencePrice = NonNullable<KaelChatTurn['reference_price']>

// A labelled market reference from real cited prices, drawn on the same rail as every other Work
// surface. It has no action: nothing here can be booked or confirmed, and the RULES #4 disclaimer
// travels with the number.
export function ReferencePriceNote({
  language,
  reference,
  tokens,
}: {
  language: AppLanguage
  reference: ReferencePrice
  tokens: CustomerThemeTokens
}) {
  const vi = language === 'vi'
  const locale = vi ? 'vi-VN' : 'en-US'
  const range = `${reference.price_min.toLocaleString(locale)}–${reference.price_max.toLocaleString(locale)} ${vi ? 'đ' : 'VND'}/${formatReferenceUnit(reference.unit, language)}`
  return (
    <View accessibilityRole="summary" style={styles.row} testID="customer-v21-reference-price-note">
      <View style={[styles.note, { borderLeftColor: caseWorkAccentLine(tokens) }]}>
        <Text style={[styles.title, { color: tokens.primary }]}>
          {vi ? 'Tham khảo thị trường · chưa đủ kiểm chứng' : 'Market reference · not yet verified'}
        </Text>
        <Text style={[styles.range, { color: tokens.text }]}>{range}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>
          {vi
            ? `Từ ${reference.source_count} nguồn công khai. Đây không phải báo giá và chưa thể đặt thợ theo con số này. Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.`
            : `From ${reference.source_count} public sources. This is not a quote and cannot be booked. This is Kael's estimate based on the available evidence. Kael may update it when new scope evidence is confirmed.`}
        </Text>
        {reference.sources.length > 0 ? (
          <View style={styles.sources}>
            <Text style={[styles.sourceLabel, { color: tokens.muted }]}>
              {vi ? 'Nguồn tham khảo' : 'Reference sources'}
            </Text>
            {reference.sources.map((source) => (
              <Pressable
                accessibilityLabel={vi ? `Mở nguồn ${source.domain}` : `Open source ${source.domain}`}
                accessibilityRole="link"
                key={source.domain}
                onPress={() => void Linking.openURL(source.url)}
                style={({ pressed }) => [
                  styles.source,
                  { backgroundColor: tokens.raised, borderColor: tokens.borderStrong, opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <Text numberOfLines={1} style={[styles.domain, { color: tokens.text }]}>{source.domain}</Text>
                <Svg height={16} viewBox="0 0 24 24" width={16}>
                  <Path d="M7 17L17 7M8 7h9v9" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                </Svg>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { ...typography.body },
  domain: { ...typography.subheadline, flex: 1, fontWeight: '600' },
  note: {
    borderLeftWidth: 2,
    gap: 8,
    marginLeft: CASE_WORK_CONTENT_INSET,
    maxWidth: 608,
    paddingLeft: CASE_WORK_RAIL_PADDING,
  },
  row: { ...CASE_WORK_ROW_STYLE },
  range: { ...typography.title3, fontWeight: '600' },
  source: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  sourceLabel: { ...typography.footnote, fontWeight: '600' },
  sources: { gap: 8, marginTop: 4 },
  title: { ...typography.subheadline, fontWeight: '600' },
})
