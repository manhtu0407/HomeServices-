import type { KaelChatTurn } from '@nestscout/shared'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { formatReferenceUnit } from './kael-next-actions-display-model'

type ReferencePrice = NonNullable<KaelChatTurn['reference_price']>

// A labelled market reference from real cited prices. It has no action: nothing here can be booked
// or confirmed, and the RULES #4 disclaimer travels with the number.
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
    <View
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
      testID="customer-v21-reference-price-note"
    >
      <Text style={[styles.title, { color: tokens.muted }]}>
        {vi ? 'Tham khảo thị trường · chưa đủ kiểm chứng' : 'Market reference · not yet verified'}
      </Text>
      <Text style={[styles.range, { color: tokens.text }]}>{range}</Text>
      <Text style={[styles.body, { color: tokens.muted }]}>
        {vi
          ? `Từ ${reference.source_count} nguồn công khai. Đây không phải báo giá và chưa thể đặt thợ theo con số này. Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.`
          : `From ${reference.source_count} public sources. This is not a quote and cannot be booked. This is Kael's estimate based on the available evidence. Kael may update it when new scope evidence is confirmed.`}
      </Text>
      {reference.sources.map((source) => (
        <Pressable
          accessibilityLabel={vi ? `Mở nguồn ${source.domain}` : `Open source ${source.domain}`}
          accessibilityRole="link"
          key={source.domain}
          onPress={() => void Linking.openURL(source.url)}
        >
          <Text style={[styles.link, { color: tokens.primary }]}>{source.domain}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 18, borderWidth: 1, gap: 8, padding: 16 },
  link: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
  range: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  title: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
})
