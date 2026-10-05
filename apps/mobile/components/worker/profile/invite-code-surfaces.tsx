import { Share, Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import { useWorkerAmbassador } from '@/lib/frontend-workflow/use-worker-ambassador'

import { styles as ambassadorStyles } from '../earnings/ambassador-styles'
import { formatVndDong, textByLanguage } from '../ui/format'
import { useWorkerThemeMode } from '../worker-theme'
import { WorkerV5ProfileGroup, WorkerV5ProfileGroupDivider, WorkerV5ProfileGroupRow } from './grouped-list-surfaces'
import { styles } from './settings-utility-styles'
import { WorkerV5UtilityGlyph } from './utility-glyphs'

type AmbassadorController = ReturnType<typeof useWorkerAmbassador>

function Text({ style, ...props }: TextProps) {
  const isDark = useWorkerThemeMode() === 'dark'
  return <RNText {...props} style={[styles.workerCustomerFontText, style, isDark ? styles.darkText : null]} />
}

export function inviteCodeErrorCopy(code: string, language: AppLanguage): string {
  if (code === 'WORKER_NOT_ELIGIBLE') {
    return textByLanguage(
      language,
      'Tài khoản cần được duyệt và đang hoạt động để có mã mời. Kiểm tra mục Giấy tờ & xác minh.',
      'Your account must be approved and active to get an invite code. Check Documents & verification.',
    )
  }
  return textByLanguage(
    language,
    'Chưa tạo được mã mời. Kiểm tra kết nối rồi thử lại.',
    'Could not create the invite code. Check your connection and try again.',
  )
}

export function inviteShareMessage(code: string, language: AppLanguage): string {
  return textByLanguage(
    language,
    `Đặt thợ sửa chữa, vệ sinh căn hộ trên NestScout và nhập mã ${code} khi đăng ký.`,
    `Book apartment repair and cleaning on NestScout and enter code ${code} when you sign up.`,
  )
}

export function WorkerV5InviteCodeBody({
  language,
  onOpenRewards,
}: {
  language: AppLanguage
  onOpenRewards: () => void
}) {
  const controller = useWorkerAmbassador()
  return <WorkerV5InviteCode controller={controller} language={language} onOpenRewards={onOpenRewards} />
}

export function WorkerV5InviteCode({
  controller,
  language,
  onOpenRewards,
}: {
  controller: AmbassadorController
  language: AppLanguage
  onOpenRewards: () => void
}) {
  const { summary } = controller

  if (!summary) {
    return (
      <View style={styles.stack} testID="worker-v5-invite-code-screen">
        <WorkerV5ProfileGroup testID="worker-v5-invite-code-unavailable" title={textByLanguage(language, 'Mã mời của bạn', 'Your invite code')}>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>
              {controller.loading
                ? textByLanguage(language, 'Đang tải mã mời', 'Loading your invite code')
                : textByLanguage(language, 'Chưa tải được mã mời', 'Your invite code is unavailable')}
            </Text>
          </View>
          {!controller.loading ? (
            <>
              <WorkerV5ProfileGroupDivider />
              <WorkerV5ProfileGroupRow
                iconElement={<WorkerV5UtilityGlyph name="clock" size={24} testID="worker-v5-invite-code-retry-glyph" />}
                iconFrame="outlined"
                onPress={() => void controller.reload()}
                testID="worker-v5-invite-code-retry"
                title={textByLanguage(language, 'Thử lại', 'Try again')}
              />
            </>
          ) : null}
        </WorkerV5ProfileGroup>
      </View>
    )
  }

  const code = summary.referral_code
  const program = summary.program
  const share = () => {
    if (!code) return
    void Share.share({ message: inviteShareMessage(code, language) })
  }

  return (
    <View style={styles.stack} testID="worker-v5-invite-code-screen">
      <WorkerV5ProfileGroup testID="worker-v5-invite-code-card" title={textByLanguage(language, 'Mã mời của bạn', 'Your invite code')}>
        <View style={styles.summary}>
          {code ? (
            <>
              <Text style={styles.summaryBody}>
                {textByLanguage(language, 'Gửi mã này cho khách mới. Khách nhập mã khi đăng ký để trở thành khách của bạn.', 'Send this code to new customers. They enter it when they sign up to become your customers.')}
              </Text>
              <View
                accessibilityLabel={textByLanguage(language, `Mã mời ${code.split('').join(' ')}`, `Invite code ${code.split('').join(' ')}`)}
                style={ambassadorStyles.codeBox}
              >
                <RNText selectable style={ambassadorStyles.codeValue} testID="worker-v5-invite-code-value">{code}</RNText>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.summaryTitle}>{textByLanguage(language, 'Bạn chưa có mã mời', 'You do not have an invite code yet')}</Text>
              <Text style={styles.summaryBody}>
                {textByLanguage(language, 'Tạo mã một lần và dùng mãi. Mã gồm 8 ký tự, không có số 0, số 1, chữ O và chữ I.', 'Create it once and keep it. The code has 8 characters and never contains 0, 1, O or I.')}
              </Text>
            </>
          )}
          {controller.codeErrorCode ? (
            <RNText accessibilityLiveRegion="polite" style={ambassadorStyles.errorText} testID="worker-v5-invite-code-error">
              {inviteCodeErrorCopy(controller.codeErrorCode, language)}
            </RNText>
          ) : null}
        </View>
        <WorkerV5ProfileGroupDivider />
        {code ? (
          <WorkerV5ProfileGroupRow
            description={textByLanguage(language, 'Gửi mã cho khách qua tin nhắn hoặc mạng xã hội.', 'Send the code to a customer by message or social app.')}
            iconElement={<WorkerV5UtilityGlyph name="chat" size={24} testID="worker-v5-invite-code-share-glyph" />}
            iconFrame="outlined"
            onPress={share}
            testID="worker-v5-invite-code-share"
            title={textByLanguage(language, 'Chia sẻ mã mời', 'Share invite code')}
          />
        ) : (
          <WorkerV5ProfileGroupRow
            accessibilityHint={textByLanguage(language, 'Tạo mã mời riêng của bạn', 'Creates your own invite code')}
            iconElement={<WorkerV5UtilityGlyph name="check" size={24} testID="worker-v5-invite-code-create-glyph" />}
            iconFrame="outlined"
            onPress={() => {
              if (!controller.codeBusy) void controller.ensureReferralCode()
            }}
            status={controller.codeBusy ? textByLanguage(language, 'Đang tạo', 'Creating') : undefined}
            testID="worker-v5-invite-code-create"
            title={textByLanguage(language, 'Tạo mã mời', 'Create invite code')}
          />
        )}
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-invite-code-rules" title={textByLanguage(language, 'Khách nhận mã', 'Customers who use your code')}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle} testID="worker-v5-invite-code-customers">
            {textByLanguage(
              language,
              `${summary.linked_customers} khách đã liên kết · ${summary.active_customers} khách đang hoạt động`,
              `${summary.linked_customers} linked customers · ${summary.active_customers} active`,
            )}
          </Text>
          <Text style={styles.summaryBody} testID="worker-v5-invite-code-claim-rule">
            {program
              ? textByLanguage(
                language,
                `Khách nhập mã trong ${program.invite_claim_days} ngày sau khi đăng ký và trước đơn thanh toán đầu tiên. Liên kết kéo dài ${program.link_months} tháng. Khách đặt lại bạn lần thứ hai trong app cũng trở thành khách của bạn.`,
                `A customer enters the code within ${program.invite_claim_days} days of signing up and before their first paid order. The link lasts ${program.link_months} months. A customer who books you a second time in the app also becomes yours.`,
              )
              : textByLanguage(language, 'Khách nhập mã trước đơn thanh toán đầu tiên để trở thành khách của bạn.', 'A customer enters the code before their first paid order to become yours.')}
          </Text>
        </View>
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-invite-code-rewards" title={textByLanguage(language, 'Thưởng đại sứ', 'Ambassador rewards')}>
        <WorkerV5ProfileGroupRow
          description={program
            ? textByLanguage(language, `1 điểm cho mỗi ${formatVndDong(program.commission_vnd_per_point, language)} phí nền tảng từ đơn của khách bạn mang về.`, `1 point for every ${formatVndDong(program.commission_vnd_per_point, language)} of platform fee from your customers' orders.`)
            : textByLanguage(language, 'Điểm từ đơn thanh toán trong app của khách bạn mang về.', 'Points from paid in-app orders by customers you brought in.')}
          iconElement={<WorkerV5UtilityGlyph name="briefcase" size={24} testID="worker-v5-invite-code-rewards-glyph" />}
          iconFrame="outlined"
          onPress={onOpenRewards}
          testID="worker-v5-invite-code-open-rewards"
          title={textByLanguage(language, 'Điểm & mốc thưởng', 'Points & milestones')}
        />
      </WorkerV5ProfileGroup>
    </View>
  )
}
