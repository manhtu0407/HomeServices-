import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'
import { customerV21BankAssets, type CustomerV21BankKey } from './assets'
import { customerV21PaymentStyles as styles } from './payment-styles'

type CustomerV21PaymentBank = { key: CustomerV21BankKey; name: string; vietQrCode: string }
type CustomerV21SourceSkin = ComponentType<{ testID?: string }>
type CustomerV21ZipAura = ComponentType<{ intensity?: 'default' | 'strong'; scope: string; testID?: string }>

export function PaymentBankTile({
  bank,
  disabled,
  onPress,
  selected,
  showMintAura = false,
  sourceCardSkin: SourceCardSkin,
  zipMintAura: ZipMintAura,
}: {
  bank: CustomerV21PaymentBank
  disabled: boolean
  onPress: () => void
  selected: boolean
  showMintAura?: boolean
  sourceCardSkin: CustomerV21SourceSkin
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <Pressable
      accessibilityLabel={`${bank.name} VietQR`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentBankTile,
        selected ? styles.paymentBankTileSelected : null,
        disabled ? styles.paymentBankTileDisabled : null,
        pressed ? styles.pressed : null,
      ]}
      testID={`customer-v21-payment-bank-tile-${bank.key}`}
    >
      <SourceCardSkin />
      {selected || showMintAura ? <ZipMintAura intensity={showMintAura ? 'strong' : 'default'} scope={`PaymentBankTile${bank.key}`} testID={`customer-v21-payment-bank-tile-${bank.key}-mint-aura`} /> : null}
      <Image
        accessibilityIgnoresInvertColors
        contentFit="contain"
        source={customerV21BankAssets[bank.key]}
        style={styles.paymentBankLogo}
        testID={`customer-v21-payment-bank-logo-${bank.key}`}
      />
      {selected ? (
        <View style={styles.paymentBankCheck}>
          <Text style={styles.paymentBankCheckText}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  )
}
