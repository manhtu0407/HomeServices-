import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import { color, spacing, typography } from '@/design/theme'
import { customerKaelConversationService, workerKaelChatService } from '@/lib/services'
import type { AppLanguage } from '@/lib/app-language'
import { KaelChip } from '@/components/ui/kael-primitives'

type FeedbackRating = 'useful' | 'not_useful'
type FeedbackActor = 'customer' | 'worker'

export function KaelTrustDisclosure({
  language,
  testID,
}: {
  language: AppLanguage
  testID?: string
}) {
  const router = useRouter()
  const copy = language === 'vi'
    ? 'Kael là trợ lý AI của NestScout. Giá và hướng dẫn luôn cần được xác nhận trong quy trình dịch vụ.'
    : 'Kael is NestScout’s AI assistant. Prices and guidance still require confirmation in the service workflow.'
  const action = language === 'vi' ? 'Xem nguyên tắc của Kael' : 'View Kael’s charter'

  return (
    <View style={styles.disclosure} testID={testID}>
      <Text style={styles.disclosureText}>{copy}</Text>
      <Pressable
        accessibilityLabel={action}
        accessibilityRole="link"
        onPress={() => router.push('/kael-charter')}
        testID={`${testID ?? 'kael-trust-disclosure'}-charter`}
      >
        <Text style={styles.disclosureLink}>{action}</Text>
      </Pressable>
    </View>
  )
}

export function KaelFeedbackControls({
  actor,
  language,
  responseId,
  testID,
}: {
  actor: FeedbackActor
  language: AppLanguage
  responseId: string
  testID?: string
}) {
  const [submittedRating, setSubmittedRating] = useState<FeedbackRating | null>(null)
  const [pendingRating, setPendingRating] = useState<FeedbackRating | null>(null)

  const submit = useCallback(async (rating: FeedbackRating) => {
    if (!responseId.trim() || pendingRating || submittedRating === rating) return
    setPendingRating(rating)
    try {
      const result = actor === 'customer'
        ? await customerKaelConversationService.submitFeedback({
            response_id: responseId,
            rating,
            source: 'customer_chat',
            language,
          })
        : await workerKaelChatService.submitFeedback({
            response_id: responseId,
            rating,
            source: 'worker_chat',
            language,
          })
      if (result.success) setSubmittedRating(rating)
    } catch {
      // Feedback is best-effort and must never interrupt the active service flow.
    } finally {
      setPendingRating(null)
    }
  }, [actor, language, pendingRating, responseId, submittedRating])

  const prompt = language === 'vi' ? 'Phản hồi này có hữu ích không?' : 'Was this response useful?'
  const useful = language === 'vi' ? 'Hữu ích' : 'Useful'
  const notUseful = language === 'vi' ? 'Chưa hữu ích' : 'Not useful'

  return (
    <View accessibilityLabel={prompt} style={styles.feedback} testID={testID}>
      <Text style={styles.feedbackPrompt}>{prompt}</Text>
      <View style={styles.feedbackActions}>
        <KaelChip
          accessibilityState={{ selected: submittedRating === 'useful', busy: pendingRating === 'useful' }}
          disabled={pendingRating !== null}
          label={useful}
          onPress={() => void submit('useful')}
          testID={`${testID ?? 'kael-feedback'}-useful`}
          variant={submittedRating === 'useful' ? 'selected' : 'unselected'}
        />
        <KaelChip
          accessibilityState={{ selected: submittedRating === 'not_useful', busy: pendingRating === 'not_useful' }}
          disabled={pendingRating !== null}
          label={notUseful}
          onPress={() => void submit('not_useful')}
          testID={`${testID ?? 'kael-feedback'}-not-useful`}
          variant={submittedRating === 'not_useful' ? 'warning' : 'unselected'}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  disclosure: {
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.surface.stroke,
  },
  disclosureText: {
    ...typography.footnote,
    color: color.text.secondary,
  },
  disclosureLink: {
    ...typography.footnote,
    color: color.brand.primaryDark,
    fontWeight: '600',
  },
  feedback: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  feedbackPrompt: {
    ...typography.footnote,
    color: color.text.secondary,
  },
  feedbackActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
