import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'

export type OnDeviceVoiceTranscriptProps = {
  disabled: boolean
  language: AppLanguage
  onChangeText: (value: string) => void
  transcript: string
  tokens: CustomerThemeTokens
}
