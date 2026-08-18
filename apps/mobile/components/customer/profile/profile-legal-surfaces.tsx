import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerProfileLegalCopy, type CustomerProfileLegalSection } from './profile-legal-content'
import { customerV21ProfileLegalStyles as styles } from './profile-legal-styles'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { ProfilePreferencePanel } from './profile-preference-surfaces'

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
      <ProfilePreferencePanel
        body={copy.heroBody}
        icon="terms"
        simple
        scope="UtilityLegal"
        testID="customer-v21-profile-legal-hero"
        title={copy.heroTitle}
        tokens={tokens}
      >
        <View style={styles.legalSectionStack}>
          <View style={styles.legalSectionHeader}>
            <Text style={[styles.legalSectionTitle, { color: tokens.text }]}>{copy.importantTitle}</Text>
            <Text style={[styles.legalSectionAction, { color: tokens.primary }]}>{copy.importantAction}</Text>
          </View>
          <View
            style={[
              styles.importantCard,
              {
                backgroundColor: tokens.base,
                borderColor: tokens.border,
              },
            ]}
            testID="customer-v21-profile-legal-important"
          >
            <View style={styles.importantContent}>
              {copy.importantBullets.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: tokens.primary }]} />
                  <Text selectable style={[styles.bulletText, { color: tokens.text }]}>{bullet}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.legalSectionHeader}>
            <Text style={[styles.legalSectionTitle, { color: tokens.text }]}>{copy.detailTitle}</Text>
            <Text style={[styles.legalSectionAction, { color: tokens.primary }]}>{copy.detailAction}</Text>
          </View>
          <View
            style={[
              styles.detailCard,
              {
                backgroundColor: tokens.base,
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
          </View>
        </View>
      </ProfilePreferencePanel>
    </View>
  )
}
