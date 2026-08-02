import type { ReactNode } from 'react'
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'

import { CaseWideMintAura, SourceCardSkin } from '../ui/aura-surfaces'
import type { CustomerV21Visual } from '../ui/assets'
import { CustomerStatusPill } from './history-surfaces'
import { AssetTile, ProgressRail, useCustomerV21SurfaceTheme, V21Card } from '../ui/shared-surfaces'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'

export function ActiveCaseCardPanel({
  activeCaseLabel,
  activeStep,
  activityImage,
  bodyTextStyle,
  cardStyle,
  caseCode,
  caseFactGrid,
  onOpen,
  openLabel,
  service,
  statusLabel,
}: {
  activeCaseLabel: string
  activeStep: number
  activityImage: CustomerV21Visual
  bodyTextStyle?: StyleProp<TextStyle>
  cardStyle?: StyleProp<ViewStyle>
  caseCode: string
  caseFactGrid: ReactNode
  onOpen: () => void
  openLabel: string
  service: string
  statusLabel: string
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card style={cardStyle} testID="customer-v21-active-case">
      <SourceCardSkin testID="customer-v21-active-case-skin" />
      <CaseWideMintAura intensity="strong" scope="ActiveCase" testID="customer-v21-active-case-mint-aura" />
      <View style={sharedStyles.cardHeaderRow}>
        <AssetTile image={activityImage} label={activeCaseLabel} size={50} />
        <View style={sharedStyles.flex}>
          <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{service}</Text>
          <Text style={[bodyTextStyle, { color: tokens.muted }]}>{caseCode}</Text>
        </View>
        <CustomerStatusPill label={statusLabel} tokens={tokens} />
      </View>
      <ProgressRail activeStep={activeStep} tokens={tokens} />
      {caseFactGrid}
      <KaelButton label={openLabel} onPress={onOpen} size="small" testID="customer-v21-active-case-open" />
    </V21Card>
  )
}
