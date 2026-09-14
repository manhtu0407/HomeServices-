export type StageFiveLanguage = 'vi' | 'en'

export function stageFiveText(language: StageFiveLanguage | undefined, vi: string, en: string): string {
  return language === 'en' ? en : vi
}
