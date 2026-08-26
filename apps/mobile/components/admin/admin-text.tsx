import { Platform, Text, type TextProps, type TextStyle } from 'react-native'

import { typography, type AppleTypographyRole } from '@/design/theme'

type AdminTextProps = Omit<TextProps, 'allowFontScaling' | 'dynamicTypeRamp' | 'role'> & {
  numeric?: boolean
  textRole: AppleTypographyRole
}

const IOS_AUTOMATIC_TYPOGRAPHY: TextStyle = {
  fontFamily: undefined,
  letterSpacing: undefined,
}

const NON_IOS_SYSTEM_TYPOGRAPHY: TextStyle = {
  fontFamily: 'System',
}

export function AdminText({ numeric = false, style, textRole, ...props }: AdminTextProps) {
  const dynamicTypeRamp = textRole === 'tabularBody' ? 'body' : textRole
  return <Text
    {...props}
    allowFontScaling
    dynamicTypeRamp={dynamicTypeRamp}
    style={[
      typography[textRole],
      style,
      Platform.OS === 'ios' ? IOS_AUTOMATIC_TYPOGRAPHY : NON_IOS_SYSTEM_TYPOGRAPHY,
      numeric && styles.tabular,
    ]}
  />
}

const styles = {
  tabular: {
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
}
