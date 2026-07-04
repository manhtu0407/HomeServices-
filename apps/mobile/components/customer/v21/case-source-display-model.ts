import type { AppLanguage } from '@/lib/app-language'

const caseWorkDataSourceFooterViJobPrefix = String.fromCharCode(195, 176, 197, 184, 226, 8364, 157, 226, 8364, 8482, 32, 78, 103, 117, 195, 161, 194, 187, 226, 8364, 339, 110, 32, 100, 195, 161, 194, 187, 194, 175, 32, 108, 105, 195, 161, 194, 187, 226, 8364, 161, 117, 32, 195, 8222, 226, 8364, 732, 195, 161, 194, 187, 226, 8222, 162, 99, 32, 108, 195, 161, 194, 186, 194, 173, 112, 32, 116, 104, 101, 111, 32, 99, 195, 402, 194, 180, 110, 103, 32, 118, 105, 195, 161, 194, 187, 226, 8364, 161, 99, 32)
const caseWorkDataSourceFooterEnJobPrefix = String.fromCharCode(195, 176, 197, 184, 226, 8364, 157, 226, 8364, 8482, 32, 73, 110, 100, 101, 112, 101, 110, 100, 101, 110, 116, 32, 100, 97, 116, 97, 32, 115, 111, 117, 114, 99, 101, 32, 102, 111, 114, 32, 106, 111, 98, 32)
const caseWorkDataSourceFooterViRealJob = String.fromCharCode(195, 176, 197, 184, 226, 8364, 157, 226, 8364, 8482, 32, 78, 103, 117, 195, 161, 194, 187, 226, 8364, 339, 110, 32, 100, 195, 161, 194, 187, 194, 175, 32, 108, 105, 195, 161, 194, 187, 226, 8364, 161, 117, 32, 195, 8222, 226, 8364, 732, 195, 161, 194, 187, 226, 8222, 162, 99, 32, 108, 195, 161, 194, 186, 194, 173, 112, 32, 116, 104, 101, 111, 32, 99, 195, 402, 194, 180, 110, 103, 32, 118, 105, 195, 161, 194, 187, 226, 8364, 161, 99, 32, 116, 104, 195, 161, 194, 186, 194, 173, 116)
const caseWorkDataSourceFooterEnRealJob = String.fromCharCode(195, 176, 197, 184, 226, 8364, 157, 226, 8364, 8482, 32, 73, 110, 100, 101, 112, 101, 110, 100, 101, 110, 116, 32, 100, 97, 116, 97, 32, 115, 111, 117, 114, 99, 101, 32, 102, 111, 114, 32, 97, 32, 114, 101, 97, 108, 32, 106, 111, 98)

export function caseWorkDataSourceFooterLabel(code: string | null | undefined, language: AppLanguage) {
  if (code) {
    return language === 'vi'
      ? `${caseWorkDataSourceFooterViJobPrefix}${code}`
      : `${caseWorkDataSourceFooterEnJobPrefix}${code}`
  }
  return language === 'vi' ? caseWorkDataSourceFooterViRealJob : caseWorkDataSourceFooterEnRealJob
}
