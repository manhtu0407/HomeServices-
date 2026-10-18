import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { CustomerKaelConversationTurn } from '@/lib/api-types/customer'
import { CustomerKaelChatContent } from '../kael-chat/customer-kael-chat-content'

export const PILLAR = {
  id: 'P370-kael-chat-next-steps',
  invariant: 'Customer normal chat ignores service-start actions in saved replies while keeping conversational suggestions usable',
  authority: ['User request: remove the unrequested Bắt đầu xử lý service chip', 'governance/protocols/frontend-test.md G2'],
  target: 'apps/mobile/components/customer/kael-chat/customer-kael-chat-content.tsx',
  layer: 'ui-visual',
  siblings: ['P373-kael-chat-service-intent', 'P369-kael-work-next-action-chips'],
  mutation: 'restore startCaseActions in the normal composer; the saved service-action cases expose a forbidden booking button',
} as const satisfies PillarManifest

jest.mock('@/lib/normal-chat-suggestions', () => ({
  useNormalChatSuggestions: () => ({ status: 'ready', suggestions: [{ id: 'follow-up', text: 'Tôi nên mô tả thêm điều gì?' }] }),
}))
jest.mock('../kael-chat/chat-stateful-surfaces', () => ({
  KaelChatSurfaceView: ({ composer }: { composer: { quickActions: { id: string; label: string; onPress: () => void }[] } }) => {
    const React = require('react')
    const { View, Text, Pressable } = require('react-native')
    return React.createElement(View, {}, composer.quickActions.map(action =>
      React.createElement(Pressable, { key: action.id, accessibilityRole: 'button', onPress: action.onPress }, React.createElement(Text, {}, action.label))))
  },
}))

function turn(label: string): CustomerKaelConversationTurn {
  return { id: 'turn-2', conversation_id: 'conversation-1', turn_index: 2, role: 'kael',
    text_content: 'Máy lạnh không mát.', created_at: '2026-10-12T03:00:00.000Z',
    next_actions: [{ id: 'start_case', kind: 'start_case', label, service_type: 'hvac' }] }
}

function controller(label: string, language: 'vi' | 'en') {
  const turns = [turn(label)]
  return {
    caseHydration: {}, chatUi: { draft: '', voiceTranscript: '' },
    conversation: { turns, assistantTurns: [], composerMediaDrafts: [], pendingNormalMessage: null, reasoningReceipt: { status: 'idle' }, setReasoningReceipt: jest.fn() },
    conversations: { turns, sessions: [], activeSessionId: 'conversation-1' }, copy: {}, deal: null, evidenceActions: {}, language,
    messageActions: { sendMessage: jest.fn(), settleStreamingReply: jest.fn() }, mode: 'normal', modeMenu: {},
    presentation: { normalAssistantTurns: [], showComposer: true }, processController: {}, reduceMotion: true, reduceTransparency: true,
    router: { push: jest.fn(), replace: jest.fn() }, sessionCatalog: {}, tokens: {}, stateScopeKey: 'test',
  }
}

describe(PILLAR.id, () => {
  it.each([
    ['vi', 'Bắt đầu xử lý: Điều hòa'],
    ['en', 'Start service: Air conditioning'],
  ] as const)('does not show an automatic service-start button in %s', (language, label) => {
    const state = controller(label, language)
    render(<CustomerKaelChatContent controller={state as unknown as Parameters<typeof CustomerKaelChatContent>[0]['controller']} />)
    withPillarContext(PILLAR, () => {
      expect(screen.queryByText(label)).toBeNull()
      expect(screen.getByText('Tôi nên mô tả thêm điều gì?')).toBeVisible()
      expect(state.router.push).not.toHaveBeenCalled()
    }, 'a saved backend service intent does not add a booking control to ordinary chat')
    fireEvent.press(screen.getByText('Tôi nên mô tả thêm điều gì?'))
    expect(state.messageActions.sendMessage).toHaveBeenCalledWith('Tôi nên mô tả thêm điều gì?')
  })
})