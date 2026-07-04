import { setPendingKaelChatDraft } from '../kael-chat/pending-intake'
import { customerCopy } from './copy'
import { styles } from './styles'
import { customerHomeActiveDealSurface, customerHomeControlSurface, customerHomeFrameSurface, customerHomeHeroSurface, customerHomeIconOnlySurface, customerHomePromptSurface, customerHomeSendSurface, customerHomeShortcutSurface, customerOpaqueSurface, glassSurface } from './surface-styles'
import { type SurfaceTone } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { type AppLanguage, localizedProblemLabel, localizedServiceLabel, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type LocalDeal, type ServiceType } from '@nestscout/shared'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { V4Frame } from './shell'
import { IconShell, MappedIcon, SubtleGlassHighlight, V4ServiceCard, V4TicketCell, canReplaceCustomerDeal, customerVisibleStatusLabel, isTerminalCustomerDeal, kaelChatPath, localizedCustomerAreaLabel, localizedProfileName, openBookingPath, openHistoryPath, openKaelChatPath, readCustomerMetadataString, useCustomerTokens } from './ui'
import type { IconName } from './ui'

const openProfilePath = '/(customer)/profile'

const kaelModel8A = require('../../../assets/kael-model-8a.png')

const kaelModel8AHead = require('../../../assets/kael-model-8a-head.png')

function bookingWizardPath(serviceType?: ServiceType | null) {
  return serviceType ? `${openBookingPath}?serviceType=${serviceType}` : openBookingPath
}

export function CustomerHomeSurface() {
  const { push, replace } = useRouter()
  const { session } = useAuth()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { reduceMotion } = useGlassAccessibility()
  const { dispatch, selectors, state } = useFrontendWorkflow()
  const [homeCommandDraft, setHomeCommandDraft] = useState('')
  const activeDeal = state.deal
  const canStartNewDeal = !activeDeal || canReplaceCustomerDeal(activeDeal.status)
  const isTerminalDeal = activeDeal ? isTerminalCustomerDeal(activeDeal.status) : false
  const activeDealRoute =
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing'
      ? kaelChatPath(activeDeal?.draft.serviceType)
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const customerMetadata = session?.user.user_metadata ?? {}
  const rawDefaultAddress = typeof customerMetadata.default_address === 'string' ? customerMetadata.default_address.trim() : ''
  const homeAreaValue = customerHomeAreaDisplayLabel(activeDeal, rawDefaultAddress, languageMode, copy.home.contextFallback)
  const homeAddressMeta = activeDeal
    ? copy.home.addressActiveMeta
    : rawDefaultAddress
      ? languageMode === 'en' ? 'Default address' : 'Địa chỉ mặc định'
      : copy.home.addressHint
  const rawDisplayName = readCustomerMetadataString(customerMetadata, 'nickname', 'preferred_name', 'full_name', 'name')
  const displayName = localizedProfileName(rawDisplayName, languageMode)
  const homeTitle = languageMode === 'en'
    ? displayName ? `${displayName}'s home` : 'Your home'
    : displayName ? `Nhà của ${displayName}` : 'Nhà của bạn'
  const customerTitle = homeTitle
  const openKaelChatFlow = (serviceType?: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(serviceType))
  }
  const openBookingFlow = (serviceType?: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(bookingWizardPath(serviceType))
  }
  const homeCommandTarget = canStartNewDeal ? openKaelChatPath : activeDealRoute
  const openHomeCommand = () => {
    if (canStartNewDeal) {
      push(openKaelChatPath)
      return
    }
    replace(activeDealRoute)
  }
  const submitHomeCommand = () => {
    const message = homeCommandDraft.trim()
    if (!message) {
      openHomeCommand()
      return
    }
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    setPendingKaelChatDraft({
      clientRequestId: generateClientRequestId(),
      createdAt: new Date().toISOString(),
      locale: languageMode,
      mediaCount: 0,
      message,
      problemChips: [],
      serviceType: null,
      source: 'kael',
    })
    setHomeCommandDraft('')
    push(openKaelChatPath)
  }
  const homeCommandActionLabel = canStartNewDeal ? copy.home.intakeCta : copy.home.quickActive
  const homeShortcuts: Array<{ icon: IconName; meta: string | null; onPress: () => void; testID: string; title: string; tone: SurfaceTone }> = [
    {
      icon: 'request',
      meta: activeDeal ? activeDealStatusLabel : null,
      onPress: () => replace(activeDeal ? activeDealRoute : openHistoryPath),
      testID: 'customer-home-shortcut-active',
      title: copy.home.quickActive,
      tone: 'service',
    },
    {
      icon: 'clock',
      meta: copy.home.quickHistoryMeta,
      onPress: () => replace(openHistoryPath),
      testID: 'customer-home-shortcut-history',
      title: copy.home.quickHistory,
      tone: 'water',
    },
    {
      icon: 'apartment',
      meta: copy.home.quickAddressMeta,
      onPress: () => replace(openProfilePath),
      testID: 'customer-home-shortcut-address',
      title: copy.home.quickAddress,
      tone: 'service',
    },
    {
      icon: 'estimate',
      meta: copy.home.quickTrustMeta,
      onPress: () => openKaelChatFlow(),
      testID: 'customer-home-shortcut-trust',
      title: copy.home.quickTrust,
      tone: 'warm',
    },
  ]
  return (
    <V4Frame active="home" testID="customer-home-surface">
      {({ tokens }) => (
        <>
          <View style={styles.v4Content}>
            <View style={styles.hiddenMarker} testID="customer-home-ios26-foundation-section" />
            <View style={styles.homeTopRow} testID="customer-home-title-row">
              <View style={styles.titleBlock}>
                <Text adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                  {customerTitle}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {copy.home.subtitle}
                </Text>
              </View>
            </View>
            <View style={styles.homeSheet}>
              <View style={styles.hiddenMarker} testID="customer-home-signature-v4" />
              <View style={styles.hiddenMarker} testID="customer-home-layer-stack" />
              <View style={styles.hiddenMarker} testID="customer-home-hero-depth-grid" />
              <View style={styles.hiddenMarker} testID="customer-home-apartment-context" />
              <View style={styles.hiddenMarker} testID="customer-utility-notification-center" />
              <ReduceMotionAwareEntranceView delayMs={100} distanceY={16} style={styles.homeHeroStack} testID="customer-home-hero-motion">
                <Pressable accessibilityLabel={`${copy.home.contextLabel}. ${homeAreaValue}`} accessibilityRole="button" onPress={() => replace(openProfilePath)} style={({ pressed }) => [styles.homeAddressCard, customerHomeFrameSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-address-card">
                  <View style={styles.homeAddressCopy}>
                    <Text style={[styles.homeAddressValue, { color: tokens.text }]} testID="customer-home-address-value">
                      {homeAreaValue}
                    </Text>
                    <Text style={[styles.homeAddressMeta, { color: tokens.muted }]} numberOfLines={1}>
                      {homeAddressMeta}
                    </Text>
                  </View>
                  <MappedIcon name="chevron" color={tokens.primary} accent={tokens.aqua} />
                </Pressable>
                <GlassCard material="liquid" mode={tokens.mode} style={[styles.homeCommandHero, customerHomeHeroSurface(tokens)]} testID="customer-home-layered-hero">
                  <View style={styles.homeCommandHitArea} testID="customer-home-kael-command">
                    <SubtleGlassHighlight />
                    <View style={styles.homeCommandHeader} testID="customer-home-prototype-kael-mini-top">
                      <KaelMascot variant="head" size={44} material="opaque" />
                      <View style={styles.homeCommandCopy}>
                        <Text style={[styles.homeCommandTitle, { color: tokens.text }]} numberOfLines={2}>
                          {copy.home.commandKicker}
                        </Text>
                        <Text style={[styles.homeCommandSubtitle, { color: tokens.muted }]} numberOfLines={1}>
                          {copy.home.commandSubtitle}
                        </Text>
                      </View>
                      <Pressable accessibilityLabel={homeCommandActionLabel} accessibilityRole="button" onPress={openHomeCommand} style={({ pressed }) => [styles.homeCommandOpen, customerHomeIconOnlySurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-kael-open">
                        <MappedIcon name="external" color={tokens.primary} accent={tokens.copper} />
                      </Pressable>
                    </View>
                    <View style={[styles.homeCommandPrompt, customerHomePromptSurface(tokens)]} testID="customer-home-kael-command-prompt">
                      <TextInput
                        accessibilityLabel={copy.home.commandTitle}
                        multiline
                        onChangeText={setHomeCommandDraft}
                        onSubmitEditing={submitHomeCommand}
                        placeholder={copy.home.commandTitle}
                        placeholderTextColor={tokens.subtleText}
                        returnKeyType="send"
                        selectionColor={tokens.primary}
                        style={[styles.homeCommandPromptInput, { caretColor: tokens.primary, color: tokens.text } as any]}
                        testID="customer-home-kael-command-input"
                        value={homeCommandDraft}
                      />
                      <View style={styles.homeCommandPromptActions}>
                        <Pressable accessibilityLabel={copy.kael.attach} accessibilityRole="button" onPress={() => openKaelChatFlow()} style={({ pressed }) => [styles.homeCommandAttach, customerHomeControlSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-kael-command-attach">
                          <Text style={[styles.homeCommandAttachText, { color: tokens.primary }]} numberOfLines={1}>
                            {copy.kael.attach}
                          </Text>
                        </Pressable>
                        <Pressable accessibilityLabel={copy.home.commandSend} accessibilityRole="button" hitSlop={4} onPress={submitHomeCommand} style={({ pressed }) => [styles.homeCommandSend, customerHomeSendSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-kael-command-send">
                          <Text style={[styles.homeCommandSendText, { color: tokens.primaryText }]} numberOfLines={1}>
                            {copy.home.commandSend}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.hiddenMarker} testID="customer-home-ticket-decor" />
                  </View>
                </GlassCard>
              </ReduceMotionAwareEntranceView>
              <ReduceMotionAwareEntranceView delayMs={150} distanceY={12} style={styles.homeServicesBlock} testID="customer-home-services-section">
                <View style={styles.sectionTitle} testID="customer-home-services-heading">
                  <Text style={[styles.homeServicesTitle, { color: tokens.text }]} numberOfLines={1}>
                    {copy.home.serviceSectionTitle}
                  </Text>
                  <Text style={[styles.homeServicesMeta, { color: tokens.primary }]} numberOfLines={1}>
                    {copy.home.serviceSectionMeta}
                  </Text>
                </View>
                <View style={styles.serviceGrid} testID="customer-home-service-grid">
                  <V4ServiceCard homeTile icon="plug" meta={copy.home.serviceMetaElectrical} showMeta={false} title={localizedServiceLabel('electrical', languageMode)} testID="customer-shell-service-electrical" tone="service" onPress={() => openBookingFlow('electrical')} />
                  <V4ServiceCard homeTile icon="faucet" meta={copy.home.serviceMetaPlumbing} showMeta={false} title={localizedServiceLabel('plumbing', languageMode)} testID="customer-shell-service-plumbing" tone="water" onPress={() => openBookingFlow('plumbing')} />
                  <V4ServiceCard homeTile icon="broom" meta={copy.home.serviceMetaCleaning} showMeta={false} title={localizedServiceLabel('cleaning', languageMode)} testID="customer-shell-service-cleaning" tone="warm" onPress={() => openBookingFlow('cleaning')} />
                </View>
              </ReduceMotionAwareEntranceView>
              <ReduceMotionAwareEntranceView delayMs={185} distanceY={10} style={styles.homeShortcutGrid} testID="customer-home-shortcuts">
                <View style={styles.hiddenMarker} testID="customer-home-real-shortcuts" />
                {homeShortcuts.slice(0, 2).map((item) => (
                  <Pressable accessibilityLabel={item.meta ? `${item.title}. ${item.meta}` : item.title} accessibilityRole="button" key={item.testID} onPress={item.onPress} style={({ pressed }) => [styles.homeShortcutTile, customerHomeShortcutSurface(tokens, item.tone), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={item.testID}>
                    <View style={styles.homeTileIconStage} testID={`${item.testID}-icon-stage`}>
                      <IconShell icon={item.icon} tone={item.tone} size={33} />
                    </View>
                    <View style={styles.homeShortcutCopy}>
                      <Text style={[styles.homeShortcutTitle, { color: tokens.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.meta ? (
                        <Text style={[styles.homeShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                          {item.meta}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ReduceMotionAwareEntranceView>
              {activeDeal ? (
                <Pressable
                  accessibilityLabel={copy.home.activeA11y(localizedServiceLabel(activeDeal.draft.serviceType, languageMode))}
                  accessibilityRole="button"
                  onPress={() => replace(activeDealRoute)}
                  style={[styles.ticketCard, customerHomeActiveDealSurface(tokens)]}
                  testID="customer-home-active-local-deal"
                >
                  <View style={styles.sectionTitle}>
                    <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                      {localizedServiceLabel(activeDeal.draft.serviceType, languageMode)}
                    </Text>
                  </View>
                  <View style={styles.twoCol}>
                    <V4TicketCell
                      label={copy.ticket.issue}
                      value={localizedProblemLabel(activeDeal.draft.problemChips[0] ?? activeDeal.draft.inferredProblemLabel, activeDeal.draft.serviceType, languageMode)}
                    />
                    <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown)} />
                  </View>
                </Pressable>
              ) : null}
              <View style={styles.hiddenMarker} testID="customer-home-trust-note" />
              <View style={styles.hiddenMarker} testID="customer-home-other-services-message" />
              <View style={styles.hiddenMarker} testID="customer-home-relaxed-stage" />
            </View>
          </View>
        </>
      )}
    </V4Frame>
  )
}

function customerHomeAreaDisplayLabel(deal: LocalDeal | null, defaultAddress: string, language: AppLanguage, fallback: string) {
  const activeAddress = deal?.draft.addressLabel.trim()
  const activeDistrict = deal?.draft.districtLabel.trim()
  const value = activeAddress || activeDistrict || defaultAddress.trim()
  return localizedCustomerAreaLabel(value, language, fallback)
}

function KaelMascot({ material = 'glass', size, variant }: { material?: 'glass' | 'opaque'; size: number; variant: 'head' | 'full' }) {
  const tokens = useCustomerTokens()
  const source = variant === 'head' ? kaelModel8AHead : kaelModel8A
  const mascotSurface = material === 'glass' ? glassSurface(tokens, 'water') : customerOpaqueSurface(tokens)
  return (
    <View
      style={[
        styles.kaelMascotFrame,
        {
          ...mascotSurface,
          borderRadius: Math.round(size * 0.32),
          height: size,
          width: size,
        },
      ]}
      testID={variant === 'head' ? 'kael-model-8a-head.png' : 'kael-model-8a.png'}
    >
      {material === 'glass' ? <SubtleGlassHighlight /> : null}
      <Image contentFit="contain" source={source} style={{ height: variant === 'head' ? size * 0.9 : size * 1.1, width: variant === 'head' ? size * 0.9 : size * 1.05 }} />
    </View>
  )
}
