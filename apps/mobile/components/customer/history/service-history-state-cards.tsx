import { Image } from 'expo-image'
import { Text, View } from 'react-native'

import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from '../ui/aura-surfaces'
import { customerV21Assets } from '../ui/assets'
import { V21Card, useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'
import { customerV21ServiceHistoryStyles as styles } from './service-history-styles'

function HistoryCardSkin({
  dark,
  testIDPrefix,
}: {
  dark: boolean
  testIDPrefix: string
}) {
  return dark ? null : <SourceCardSkin testID={`${testIDPrefix}-card-skin`} />
}

export function HistoryCardAura({
  dark,
  softenTopRight = false,
  scope,
  testIDPrefix,
}: {
  dark: boolean
  softenTopRight?: boolean
  scope: string
  testIDPrefix: string
}) {
  return (
    <>
      <HistoryCardSkin dark={dark} testIDPrefix={testIDPrefix} />
      <CaseWideMintAura
        intensity={softenTopRight ? 'soft' : 'default'}
        scope={`${scope}Wide`}
        testID={`${testIDPrefix}-wide-mint-aura`}
      />
      <ZipMintAura
        intensity={softenTopRight ? 'soft' : 'default'}
        scope={`${scope}Fine`}
        testID={`${testIDPrefix}-mint-aura`}
      />
    </>
  )
}

export function HistoryEmptyCard({
  body,
  dark,
  title,
  tokens,
}: {
  body: string
  dark: boolean
  title: string
  tokens: ReturnType<typeof useCustomerV21SurfaceTheme>['tokens']
}) {
  return (
    <V21Card
      style={[
        styles.historyAuraCard,
        styles.historyStateCard,
        { backgroundColor: tokens.raised, borderColor: tokens.border },
      ]}
      testID="customer-v21-history-empty"
    >
      <HistoryCardAura dark={dark} scope="HistoryEmpty" softenTopRight testIDPrefix="customer-v21-history-empty" />
      <View style={styles.historyStateContent}>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          contentFit="contain"
          source={dark ? customerV21Assets.historyErrorWorkartDark : customerV21Assets.historyErrorWorkart}
          style={styles.historyStateIllustration}
          testID="customer-v21-history-empty-workart"
        />
        <Text style={[styles.historyStateTitle, { color: tokens.text }]} testID="customer-v21-history-empty-title">
          {title}
        </Text>
        <Text style={[styles.historyStateBody, { color: tokens.muted }]} testID="customer-v21-history-empty-body">
          {body}
        </Text>
      </View>
    </V21Card>
  )
}
