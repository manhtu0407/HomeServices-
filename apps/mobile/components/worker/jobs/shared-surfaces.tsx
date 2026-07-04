import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { styles } from './shared-styles'

type WorkerV5SharedAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>

type WorkerV5PriceLine = {
  label: string
  value: string
}

type WorkerV5InfoGridItem = {
  label: string
  value: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5KaelDraftCard({
  body,
  caseWideAura: CaseWideAura,
  chatIcon,
  formulaAura = false,
  language,
  reduceTransparency,
  title,
  zipAura: ZipAura,
}: {
  body: string
  caseWideAura: WorkerV5SharedAuraComponent
  chatIcon: ImageSourcePropType
  formulaAura?: boolean
  language: AppLanguage
  reduceTransparency: boolean
  title: string
  zipAura: WorkerV5SharedAuraComponent
}) {
  return (
    <View style={[styles.kaelDraftCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-draft-card">
      {formulaAura && !reduceTransparency ? (
        <>
          <CaseWideAura scope="KaelDraftCardWide" style={styles.formulaWideAura} testID="worker-v5-kael-draft-mint-aura" />
          <ZipAura scope="KaelDraftCardFine" style={styles.formulaZipAura} testID="worker-v5-kael-draft-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.kaelDraftAvatar}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={chatIcon} style={styles.kaelDraftIcon} />
      </View>
      <View style={styles.kaelDraftCopy}>
        <Text style={styles.kaelDraftTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.kaelDraftBody} numberOfLines={2}>{body}</Text>
      </View>
      <Text accessibilityLabel={textByLanguage(language, 'M\u1edf chi ti\u1ebft', 'Open details')} style={styles.kaelDraftChevron}>{'\u203a'}</Text>
    </View>
  )
}

export function WorkerV5PriceLines({
  caseWideAura: CaseWideAura,
  formulaAura = false,
  reduceTransparency = false,
  rows,
  total,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5SharedAuraComponent
  formulaAura?: boolean
  reduceTransparency?: boolean
  rows: ReadonlyArray<WorkerV5PriceLine>
  total?: WorkerV5PriceLine
  zipAura: WorkerV5SharedAuraComponent
}) {
  return (
    <View style={[styles.priceLinesCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-price-lines">
      {formulaAura && !reduceTransparency ? (
        <>
          <CaseWideAura scope="PriceLinesWide" style={styles.formulaWideAura} testID="worker-v5-price-lines-mint-aura" />
          <ZipAura scope="PriceLinesFine" style={styles.formulaZipAura} testID="worker-v5-price-lines-zip-mint-aura" />
        </>
      ) : null}
      {rows.map((row, index) => (
        <View key={`${row.label}-${row.value}`} style={styles.priceLine}>
          <Text style={styles.priceLineLabel} numberOfLines={2} testID={`worker-v5-price-line-label-${index}`}>{row.label}</Text>
          <Text style={styles.priceLineValue} numberOfLines={2} testID={`worker-v5-price-line-value-${index}`}>{row.value}</Text>
        </View>
      ))}
      {total ? (
        <View style={styles.priceTotalLine}>
          <Text style={styles.priceTotalLabel} numberOfLines={2} testID="worker-v5-price-total-label">{total.label}</Text>
          <Text style={styles.priceTotalValue} numberOfLines={2} testID="worker-v5-price-total-value">{total.value}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function WorkerV5InfoRow({
  icon,
  icons,
  iconVisualBoost,
  label,
  reduceTransparency = false,
  value,
}: {
  icon: WorkerV5IconName
  icons: WorkerV5IconMap
  iconVisualBoost?: ReadonlySet<WorkerV5IconName>
  label: string
  reduceTransparency?: boolean
  value: string
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconShell} testID="worker-v5-info-icon-shell">
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={icons[icon]}
          style={[
            styles.infoIcon,
            iconVisualBoost?.has(icon) ? styles.profileRouteIconVisualBoost : null,
          ]}
          testID="worker-v5-info-icon"
        />
      </View>
      <View style={styles.infoTextColumn}>
        <Text style={styles.infoLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  )
}

export function WorkerV5InfoGrid({ items }: { items: ReadonlyArray<WorkerV5InfoGridItem> }) {
  return (
    <View style={styles.infoGrid} testID="worker-v5-info-grid">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={styles.infoCell}>
          <Text style={styles.infoCellValue} numberOfLines={1} testID={`worker-v5-info-cell-value-${index}`}>{item.value}</Text>
          <Text style={styles.infoCellLabel} numberOfLines={2} testID={`worker-v5-info-cell-label-${index}`}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}
