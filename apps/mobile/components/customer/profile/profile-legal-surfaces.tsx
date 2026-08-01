import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21Assets } from '../ui/assets'
import { customerProfileLegalCopy, type CustomerProfileLegalSection } from './profile-legal-content'
import { customerV21ProfileLegalStyles as styles } from './profile-legal-styles'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { ProfileAuraCard, ProfileFormulaMintSurface, SettingsActionRow } from './profile-utility-surfaces'
import { SectionActionHeader } from '../ui/shared-surfaces'

export function ProfileSettingsLegalRow({
  language,
  onPress,
  tokens,
}: {
  language: AppLanguage
  onPress: () => void
  tokens: CustomerThemeTokens
}) {
  return (
    <SettingsActionRow
      body={language === 'vi' ? 'Hiểu quyền, trách nhiệm và cách thông tin của bạn được bảo vệ.' : 'Understand your rights, responsibilities, and how your information is protected.'}
      details={[
        { glyph: 'document', label: language === 'vi' ? 'Điều khoản sử dụng' : 'Terms of use' },
        { glyph: 'shield', label: language === 'vi' ? 'Quyền riêng tư' : 'Privacy' },
      ]}
      image={customerV21Assets.privacy}
      onPress={onPress}
      status={language === 'vi' ? 'Mở' : 'Open'}
      testID="customer-v21-profile-settings-legal"
      title={language === 'vi' ? 'Điều khoản & Chính sách' : 'Terms & Policies'}
      tokens={tokens}
    />
  )
}

export function ProfileLegalView({
  language,
  tokens,
}: {
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const copy = customerProfileLegalCopy(language)
  const [openSection, setOpenSection] = useState<CustomerProfileLegalSection['id'] | null>('terms')

  return (
    <View style={profileUtilityStyles.profileUtilityStack} testID="customer-v21-profile-utility-legal-screen">
      <ProfileAuraCard
        cardStyle={styles.heroCard}
        contentStyle={styles.heroContent}
        scope="UtilityLegalHero"
        testID="customer-v21-profile-legal-hero"
      >
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, { color: tokens.text }]}>{copy.heroTitle}</Text>
          <Text style={[styles.heroBody, { color: tokens.muted }]}>{copy.heroBody}</Text>
        </View>
      </ProfileAuraCard>

      <SectionActionHeader action={copy.importantAction} title={copy.importantTitle} />
      <ProfileFormulaMintSurface
        contentStyle={styles.importantContent}
        scope="UtilityLegalImportant"
        style={[
          styles.importantCard,
          {
            backgroundColor: tokens.raised,
            borderColor: tokens.border,
          },
        ]}
        testID="customer-v21-profile-legal-important"
      >
        {copy.importantBullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: tokens.primary }]} />
            <Text selectable style={[styles.bulletText, { color: tokens.text }]}>{bullet}</Text>
          </View>
        ))}
      </ProfileFormulaMintSurface>

      <SectionActionHeader action={copy.detailAction} title={copy.detailTitle} />
      <ProfileFormulaMintSurface
        scope="UtilityLegalDetails"
        style={[
          styles.detailCard,
          {
            backgroundColor: tokens.raised,
            borderColor: tokens.border,
          },
        ]}
        testID="customer-v21-profile-legal-details"
      >
        {copy.sections.map((section, index) => {
          const expanded = openSection === section.id
          return (
            <View key={section.id} testID={`customer-v21-profile-legal-section-${section.id}`}>
              {index > 0 ? <View style={[styles.detailDivider, { backgroundColor: tokens.border }]} /> : null}
              <Pressable
                accessibilityHint={language === 'vi' ? 'Chạm để mở hoặc thu gọn nội dung' : 'Tap to expand or collapse'}
                accessibilityLabel={section.title}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpenSection((current) => current === section.id ? null : section.id)}
                style={({ pressed }) => [styles.sectionButton, pressed ? styles.sectionPressed : null]}
                testID={`customer-v21-profile-legal-section-${section.id}-button`}
              >
                <View style={styles.detailTitleCopy}>
                  <Text style={[styles.detailTitle, { color: tokens.text }]}>{section.title}</Text>
                  <Text style={[styles.detailSummary, { color: tokens.muted }]}>{section.summary}</Text>
                </View>
                <View accessible={false} style={styles.chevron}>
                  <Svg height={20} viewBox="0 0 20 20" width={20}>
                    <Path
                      d={expanded ? 'M4.5 12.5L10 7l5.5 5.5' : 'M4.5 7.5L10 13l5.5-5.5'}
                      fill="none"
                      stroke={tokens.primary}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                    />
                  </Svg>
                </View>
              </Pressable>

              {expanded ? (
                <View style={styles.detailBody} testID={`customer-v21-profile-legal-section-${section.id}-content`}>
                  {section.paragraphs.map((paragraph) => (
                    <Text key={paragraph} selectable style={[styles.detailParagraph, { color: tokens.text }]}>
                      {paragraph}
                    </Text>
                  ))}
                  {section.bullets?.map((bullet) => (
                    <View key={bullet} style={styles.bulletRow}>
                      <View style={[styles.bulletDot, { backgroundColor: tokens.primary }]} />
                      <Text selectable style={[styles.bulletText, { color: tokens.text }]}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}
      </ProfileFormulaMintSurface>
    </View>
  )
}
