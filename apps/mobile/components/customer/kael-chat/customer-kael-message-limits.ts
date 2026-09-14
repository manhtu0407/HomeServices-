import type { AppLanguage } from '@/lib/app-language'

export const CUSTOMER_KAEL_MESSAGE_MAX_LENGTH = 5_000

export function customerKaelMessageLengthError(message: string, language: AppLanguage) {
  if (message.length <= CUSTOMER_KAEL_MESSAGE_MAX_LENGTH) return null
  return language === 'vi'
    ? `Tin nhắn quá dài. Vui lòng giữ trong ${CUSTOMER_KAEL_MESSAGE_MAX_LENGTH} ký tự.`
    : `This message is too long. Keep it within ${CUSTOMER_KAEL_MESSAGE_MAX_LENGTH} characters.`
}
