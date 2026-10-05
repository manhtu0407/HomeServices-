import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { CustomerKaelSessionMenu } from '@/components/customer/kael-chat/kael-session-menu'
import { WorkerV5KaelSessionMenu } from '@/components/worker/chat/session-menu'
import type { WorkerKaelChatSession } from '@/lib/api-types'
import type { CustomerKaelConversationSession } from '@/lib/api-types/customer'

export const PILLAR = {
  id: 'P315-kael-session-menu-fixed-size',
  invariant:
    'the Kael session menu keeps one size while a row is renamed, pinned or deleted, in the Customer and Worker chats: renaming puts Cancel and Save in the row as liquid controls, Save is locked while the name is empty, the delete confirmation fits the menu width, and "New conversation" is the 48pt header-material pill inside the menu frame',
  authority: [
    'governance/design.md (controls keep their footprint; one material per control family)',
    'governance/RULES.md #8 (no destructive action without an explicit confirmation)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/kael-session-menu.tsx',
  layer: 'ui-visual',
  siblings: ['P314-kael-chat-liquid-controls'],
  mutation:
    'widen the menu shell while a row is renamed or deleted, or let the session list grow past 138 — a size case turns red',
} as const satisfies PillarManifest

const customerSession: CustomerKaelConversationSession = {
  case_job_id: null,
  case_session_id: null,
  client_request_id: 'size-session-request',
  customer_id: 'customer-size',
  id: 'size-session',
  mode: 'normal',
  pinned_at: null,
  profile_id: null,
  service_type: null,
  started_at: '2026-10-05T00:00:00.000Z',
  title: 'Chat thường',
  total_turns: 2,
  updated_at: '2026-10-05T00:00:00.000Z',
}

const workerSession = {
  closed_at: null,
  id: 'size-session',
  job_id: null,
  mode: 'normal',
  pinned_at: null,
  started_at: '2026-10-05T00:00:00.000Z',
  status: 'active',
  title: 'Chat thường',
  total_turns: 2,
  updated_at: '2026-10-05T00:00:00.000Z',
  worker_id: 'worker-size',
} as unknown as WorkerKaelChatSession

const shared = {
  activeSessionId: null,
  canCreate: true,
  error: null,
  language: 'vi' as const,
  loading: false,
  mode: 'normal' as const,
  onArchive: jest.fn(async () => true),
  onCreate: jest.fn(),
  onPin: jest.fn(async () => true),
  onRename: jest.fn(async () => true),
  onSelect: jest.fn(),
  pendingSessionIds: [],
  reduceMotion: true,
  reduceTransparency: false,
}

function sizes(prefix: string) {
  return {
    list: StyleSheet.flatten(screen.getByTestId(`${prefix}-session-list`).props.style),
    shell: StyleSheet.flatten(screen.getByTestId(`${prefix}-session-menu-shell`).props.style),
  }
}

describe('P315 Kael session menu keeps its size', () => {
  it.each([
    ['Customer', 'customer-v21-kael', () => render(<CustomerKaelSessionMenu {...shared} sessionEphemeralStateById={{}} sessions={[customerSession]} tokens={getCustomerThemeTokens('light')} />)],
    ['Worker', 'worker-v5-kael', () => render(<WorkerV5KaelSessionMenu {...shared} sessions={[workerSession]} />)],
  ])('%s: rename and delete leave the menu and list size unchanged', (_role, prefix, renderMenu) => {
    renderMenu()
    const initial = sizes(prefix)
    withPillarContext(PILLAR, () => {
      expect(initial.shell).toMatchObject({ maxWidth: 208, width: '59%' })
      expect(initial.list.maxHeight).toBe(138)
      expect(StyleSheet.flatten(screen.getByTestId(`${prefix}-session-new-surface`).props.style)).toMatchObject({ minHeight: 48 })
    })

    fireEvent.press(screen.getByTestId(`${prefix}-session-actions-size-session`))
    fireEvent.press(screen.getByTestId(`${prefix}-session-rename-size-session`))
    withPillarContext(PILLAR, () => {
      expect(sizes(prefix)).toEqual(initial)
      expect(screen.getByTestId(`${prefix}-session-title-cancel`)).toHaveProp('accessibilityLabel', 'Hủy')
      expect(screen.getByTestId(`${prefix}-session-title-save`)).toHaveProp('accessibilityLabel', 'Lưu')
    }, 'renaming')
    fireEvent.changeText(screen.getByTestId(`${prefix}-session-title-input`), '   ')
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId(`${prefix}-session-title-save`)).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }))
    }, 'empty name')
    fireEvent.press(screen.getByTestId(`${prefix}-session-title-cancel`))

    fireEvent.press(screen.getByTestId(`${prefix}-session-actions-size-session`))
    fireEvent.press(screen.getByTestId(`${prefix}-session-delete-size-session`))
    withPillarContext(PILLAR, () => {
      expect(sizes(prefix)).toEqual(initial)
      expect(screen.getByTestId(`${prefix}-session-delete-confirm-size-session`)).toBeOnTheScreen()
    }, 'delete confirmation')
  })
})
