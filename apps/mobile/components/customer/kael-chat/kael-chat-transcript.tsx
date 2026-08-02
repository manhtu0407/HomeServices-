import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ChatStyles as styles } from './chat-styles'
import { isChatNearBottom } from './kael-chat-scroll'

export type ChatTranscriptRow = {
  key: string
  node: ReactNode
}

export function KaelChatTranscript({
  empty,
  hiddenScrollbarStyle,
  language,
  menuOpen,
  reduceMotion,
  responseInFlight,
  rows,
  tokens,
}: {
  empty: boolean
  hiddenScrollbarStyle: StyleProp<ViewStyle>
  language: AppLanguage
  menuOpen: boolean
  reduceMotion: boolean
  responseInFlight: boolean
  rows: ChatTranscriptRow[]
  tokens: CustomerThemeTokens
}) {
  const [newResponseAvailable, setNewResponseAvailable] = useState(false)
  const autoFollowRef = useRef(true)
  const transcriptRef = useRef<FlatList<ChatTranscriptRow>>(null)

  const scrollToLatest = useCallback((animated: boolean) => {
    autoFollowRef.current = true
    setNewResponseAvailable(false)
    transcriptRef.current?.scrollToEnd({ animated })
  }, [])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nearBottom = isChatNearBottom(event.nativeEvent)
    autoFollowRef.current = nearBottom
    if (nearBottom) setNewResponseAvailable(false)
  }, [])

  const handleSizeChange = useCallback(() => {
    if (autoFollowRef.current) {
      transcriptRef.current?.scrollToEnd({ animated: false })
      return
    }
    if (responseInFlight) setNewResponseAvailable(true)
  }, [responseInFlight])

  return (
    <>
      <FlatList
        contentContainerStyle={[
          styles.chatTranscript,
          empty ? styles.chatTranscriptEmpty : null,
          menuOpen ? styles.chatTranscriptMenuOpen : null,
        ]}
        data={rows}
        initialNumToRender={12}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={8}
        onContentSizeChange={handleSizeChange}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          autoFollowRef.current = false
        }}
        ref={transcriptRef}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderTranscriptRow}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        style={[styles.chatTranscriptScroll, hiddenScrollbarStyle]}
        testID="customer-v21-kael-thread"
        windowSize={7}
      />
      {newResponseAvailable ? (
        <Pressable
          accessibilityLabel={language === 'vi' ? 'Chuy\u1ec3n \u0111\u1ebfn ph\u1ea7n m\u1edbi' : 'Jump to the latest response'}
          accessibilityRole="button"
          onPress={() => scrollToLatest(!reduceMotion)}
          style={[
            styles.chatLatestButton,
            { backgroundColor: tokens.primary, shadowColor: tokens.primary },
          ]}
          testID="customer-v21-kael-jump-to-latest"
        >
          <Text style={[styles.chatLatestButtonText, { color: tokens.primaryText }]}>
            {language === 'vi' ? 'Ph\u1ea7n m\u1edbi' : 'Latest'}
          </Text>
        </Pressable>
      ) : null}
    </>
  )
}

function renderTranscriptRow({ item }: ListRenderItemInfo<ChatTranscriptRow>) {
  return <>{item.node}</>
}
