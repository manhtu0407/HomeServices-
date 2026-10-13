import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { stableImageSource } from '@/lib/stable-image-source'

import type { CustomerThemeTokens } from '../customer-theme'

export type WorkerIdentity = {
  avatarUrl: string | null
  birthYear?: number | null
  displayName: string
  gender?: 'male' | 'female' | 'other' | null
  // A rating only means something once the worker has finished jobs.
  rating: number | null
  totalJobs: number
  yearsExperience?: number | null
}

// Who the worker is, shown the same way when the customer reviews a candidate and after the match.
export function WorkerIdentitySummary({
  identity,
  language,
  meta,
  testIDPrefix,
  tokens,
}: {
  identity: WorkerIdentity
  language: AppLanguage
  meta?: ReactNode
  testIDPrefix: string
  tokens: CustomerThemeTokens
}) {
  const { avatarUrl, displayName } = identity
  const personalFacts = workerPersonalFacts(identity, language)
  const facts = workerFacts(identity, language)
  return (
    <>
      <View style={styles.identity} testID={`${testIDPrefix}-identity`}>
        <View style={[styles.avatarFrame, { backgroundColor: tokens.service }]}>
          {avatarUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={language === 'vi' ? `Ảnh đại diện của ${displayName}` : `${displayName}'s profile photo`}
              contentFit="cover"
              source={stableImageSource(avatarUrl)}
              style={styles.avatar}
              testID={`${testIDPrefix}-avatar`}
            />
          ) : (
            <Text
              accessibilityLabel={language === 'vi' ? `Chưa có ảnh đại diện của ${displayName}` : `${displayName} has no profile photo`}
              style={[styles.avatarFallback, { color: tokens.primary }]}
              testID={`${testIDPrefix}-avatar-fallback`}
            >
              {workerInitials(displayName)}
            </Text>
          )}
        </View>
        <View style={styles.identityCopy}>
          <Text style={[styles.name, { color: tokens.text }]}>{displayName}</Text>
          {personalFacts.length > 0 ? (
            <Text style={[styles.personalFacts, { color: tokens.muted }]} testID={`${testIDPrefix}-personal-facts`}>
              {personalFacts.join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
      {meta}
      {facts.length > 0 ? (
        <Text accessibilityLabel={facts.join(', ')} style={[styles.facts, { color: tokens.muted }]} testID={`${testIDPrefix}-facts`}>
          {facts.join(' · ')}
        </Text>
      ) : (
        <Text style={[styles.facts, { color: tokens.muted }]}>
          {language === 'vi' ? 'Chưa có lịch sử công việc đủ để hiển thị thêm.' : 'There is not enough completed-job history to show more yet.'}
        </Text>
      )}
    </>
  )
}

function workerFacts(identity: WorkerIdentity, language: AppLanguage) {
  const facts: string[] = []
  if (identity.rating !== null && identity.totalJobs > 0) facts.push(`${identity.rating.toFixed(1)} ★`)
  if (identity.totalJobs > 0) facts.push(language === 'vi' ? `${identity.totalJobs} việc đã hoàn tất` : `${identity.totalJobs} completed jobs`)
  if (identity.yearsExperience && identity.yearsExperience > 0) {
    facts.push(language === 'vi' ? `${identity.yearsExperience} năm kinh nghiệm` : `${identity.yearsExperience} years experience`)
  }
  return facts
}

function workerPersonalFacts(identity: WorkerIdentity, language: AppLanguage) {
  const facts: string[] = []
  if (typeof identity.birthYear === 'number' && Number.isSafeInteger(identity.birthYear)) {
    facts.push(language === 'vi' ? `Sinh năm ${identity.birthYear}` : `Born ${identity.birthYear}`)
  }
  if (identity.gender) {
    const labels = language === 'vi'
      ? { female: 'Nữ', male: 'Nam', other: 'Khác' }
      : { female: 'Female', male: 'Male', other: 'Other' }
    facts.push(labels[identity.gender])
  }
  return facts
}

function workerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(-2).map((part) => part[0]?.toLocaleUpperCase() ?? '').join('') || 'K'
}

const styles = StyleSheet.create({
  avatar: { height: '100%', width: '100%' },
  avatarFallback: { ...typography.headline },
  avatarFrame: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  facts: { ...typography.subheadline },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 5 },
  identityCopy: { flex: 1, gap: 3 },
  name: { ...typography.headline },
  personalFacts: { ...typography.footnote },
})
