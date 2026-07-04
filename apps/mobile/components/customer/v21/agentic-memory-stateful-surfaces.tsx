import { Fragment } from 'react'
import { Text, View, type ImageSourcePropType } from 'react-native'

import type { CustomerKaelMemoryPreferenceKey } from '@nestscout/shared'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { AgenticStageBackdropAura, AgenticStageHero, MemoryDivider, MemoryPermissionRow } from './agentic-surfaces'
import { CaseWideMintAura, CaseWorkCardAura, SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21AgenticStyles as agenticStyles } from './agentic-styles'
import { AssetTile, SectionActionHeader, V21Card } from './shared-surfaces'

export type AgenticMemoryStageViewRow = {
  enabled: boolean
  image: ImageSourcePropType
  label: string
  preferenceKey: CustomerKaelMemoryPreferenceKey
  value: string
}

export function AgenticMemoryStageView({
  language,
  memoryCountLabel,
  onSaveMemory,
  onToggleMemoryPreference,
  pendingPreferenceKey,
  reduceTransparency,
  sharePreferencesEnabled,
  tokens,
  visibleMemoryRows,
}: {
  language: AppLanguage
  memoryCountLabel: string
  onSaveMemory: () => void
  onToggleMemoryPreference: (key: CustomerKaelMemoryPreferenceKey, currentEnabled: boolean) => void
  pendingPreferenceKey: CustomerKaelMemoryPreferenceKey | null
  reduceTransparency: boolean
  sharePreferencesEnabled: boolean
  tokens: CustomerThemeTokens
  visibleMemoryRows: AgenticMemoryStageViewRow[]
}) {
  return (
    <View style={agenticStyles.agenticStageStack} testID="customer-v21-profile-memory">
      <AgenticStageBackdropAura reduceTransparency={reduceTransparency} scope="Memory" />
      <AgenticStageHero
        assetTile={AssetTile}
        body=""
        image={customerV21Assets.memory}
        pill={language === 'vi' ? `${memoryCountLabel} MỤC GHI NHỚ` : `${memoryCountLabel} MEMORY ITEMS`}
        scope="AgenticMemoryHero"
        testID="customer-v21-agentic-memory-hero"
        tokens={tokens}
        title={language === 'vi' ? 'Kael nhớ về bạn,\ntheo quyền bạn cho.' : 'Kael remembers you\nwith your permission.'}
      />

      <SectionActionHeader
        action={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}
        title={language === 'vi' ? 'Thông tin được phép dùng' : 'Allowed information'}
      />
      <V21Card style={agenticStyles.agenticMemoryListCard} testID="customer-v21-agentic-memory-allowed">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticMemoryAllowedWide" testID="customer-v21-agentic-memory-allowed-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticMemoryAllowed" testID="customer-v21-agentic-memory-allowed-mint-aura" />
        {visibleMemoryRows.map((row, index) => (
          <Fragment key={row.label}>
            {index > 0 ? <MemoryDivider /> : null}
            <MemoryPermissionRow
              enabled={row.enabled}
              image={row.image}
              label={row.label}
              onToggle={() => onToggleMemoryPreference(row.preferenceKey, row.enabled)}
              pending={pendingPreferenceKey === row.preferenceKey}
              preferenceKey={row.preferenceKey}
              value={row.value}
            />
          </Fragment>
        ))}
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Quyền riêng tư ›' : 'Privacy ›'}
        title={language === 'vi' ? 'Ranh giới dữ liệu' : 'Data boundaries'}
      />
      <V21Card style={agenticStyles.agenticMemoryListCard} testID="customer-v21-agentic-memory-boundaries">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticMemoryBoundaryWide" testID="customer-v21-agentic-memory-boundary-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticMemoryBoundary" testID="customer-v21-agentic-memory-boundary-mint-aura" />
        <MemoryPermissionRow
          control="chip"
          enabled
          image={customerV21Assets.privacy}
          label={language === 'vi' ? 'Không trộn trò chuyện thường vào công việc' : 'Do not mix normal chat into jobs'}
          statusLabel={language === 'vi' ? 'Bật' : 'On'}
          value={language === 'vi' ? 'Chỉ dữ liệu được chọn mới thành bằng chứng' : 'Only selected data becomes evidence'}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          enabled={sharePreferencesEnabled}
          image={customerV21Assets.profile}
          label={language === 'vi' ? 'Chia sẻ sở thích với thợ' : 'Share preferences with worker'}
          onToggle={() => onToggleMemoryPreference(
            'share_preferences_with_worker',
            sharePreferencesEnabled,
          )}
          pending={pendingPreferenceKey === 'share_preferences_with_worker'}
          preferenceKey="share_preferences_with_worker"
          value={language === 'vi' ? 'Chỉ sau khi bạn đồng ý cho từng công việc' : 'Only after you approve each job'}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          control="chip"
          enabled
          image={customerV21Assets.shield}
          label={language === 'vi' ? 'Cảnh báo thanh toán ngoài nền tảng' : 'Off-platform payment warning'}
          statusLabel={language === 'vi' ? 'Bật' : 'On'}
          value={language === 'vi' ? 'Luôn nhắc để bảo vệ quyền lợi' : 'Always reminds you to stay protected'}
        />
      </V21Card>
      <KaelButton
        label={language === 'vi' ? 'Lưu thay đổi' : 'Save changes'}
        onPress={onSaveMemory}
        style={agenticStyles.agenticMemorySaveButton}
        testID="customer-v21-agentic-memory-save"
      />
      <Text style={[agenticStyles.agenticMemoryNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Bộ nhớ chỉ hỗ trợ Kael. Nó không tự vượt qua cổng phê duyệt.'
          : 'Memory only supports Kael. It cannot bypass approval gates.'}
      </Text>
    </View>
  )
}
