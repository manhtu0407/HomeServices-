import { Text as RNText, type TextProps } from 'react-native'
import { prototypeStyles } from './worker-jobs-legacy-prototype-styles'

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[prototypeStyles.text, style]} />
}
