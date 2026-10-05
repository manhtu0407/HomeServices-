import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import type { WorkerKaelChatSession } from '@/lib/api-types'

import { WorkerV5KaelSessionMenu } from '../chat/session-menu'

jest.mock('@/components/ui/glass-surface', () => {
  const React = require('react') as typeof import('react')
  const { View } = require('react-native') as typeof import('react-native')
  return {
    GlassSurface: ({ children, ...props }: React.ComponentProps<typeof View>) => React.createElement(View, props, children),
  }
})

jest.mock('@/components/ui/liquid-back-button', () => {
  const React = require('react') as typeof import('react')
  const { Pressable } = require('react-native') as typeof import('react-native')
  return {
    LiquidControlButton: ({ children, size = 30, ...props }: { children: React.ReactNode; size?: number } & Record<string, unknown>) =>
      React.createElement(Pressable, { ...props, style: { height: size, width: size } }, children),
    LiquidSurfaceOverlay: () => null,
  }
})

const session: WorkerKaelChatSession = {
  closed_at: null,
  id: 'layout-session',
  job_id: null,
  mode: 'normal',
  pinned_at: null,
  progress: null,
  started_at: '2026-07-23T00:00:00.000Z',
  status: 'active',
  title: null,
  total_turns: 2,
  worker_id: 'worker-layout-test',
}

describe('Worker Kael session rename layout', () => {
  it('edits the title directly on its row and keeps the input within the fixed menu width', () => {
    const onSelect = jest.fn()
    render(
      <WorkerV5KaelSessionMenu
        activeSessionId={null}
        canCreate
        error={null}
        language="vi"
        loading={false}
        mode="normal"
        onArchive={jest.fn(async () => true)}
        onCreate={jest.fn()}
        onPin={jest.fn(async () => true)}
        onRename={jest.fn(async () => true)}
        onSelect={onSelect}
        pendingSessionIds={[]}
        reduceMotion
        reduceTransparency
        sessions={[session]}
      />,
    )

    const sessionMainStyle = screen.getByTestId('worker-v5-kael-session-layout-session').props.style
    const moreButtonStyle = screen.getByTestId('worker-v5-kael-session-actions-layout-session').props.style
    expect(StyleSheet.flatten(sessionMainStyle)).toMatchObject({ minWidth: 0, zIndex: 0 })
    expect(StyleSheet.flatten(moreButtonStyle)).toMatchObject({
      flexShrink: 0,
      minHeight: 44,
      minWidth: 44,
      width: 44,
      zIndex: 2,
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-actions-layout-session'))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-rename-layout-session'))

    const menuStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-menu-shell').props.style)
    const listStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-list').props.style)
    const input = screen.getByTestId('worker-v5-kael-session-title-input')
    const titleRow = screen.getByTestId('worker-v5-kael-session-title-row-layout-session')
    const sessionCopy = screen.getByTestId('worker-v5-kael-session-copy-layout-session')
    const renameActions = screen.getByTestId('worker-v5-kael-session-rename-actions-layout-session')
    const renameCancel = screen.getByTestId('worker-v5-kael-session-title-cancel')
    const renameSave = screen.getByTestId('worker-v5-kael-session-title-save')
    expect(menuStyle).toMatchObject({ maxWidth: 208, width: '59%' })
    expect(listStyle.maxHeight).toBe(138)
    expect(within(titleRow).getByTestId('worker-v5-kael-session-title-input')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-session-rename-editor-layout-session')).toBeNull()
    expect(input.props.selectTextOnFocus).toBeFalsy()
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 0,
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 0,
    })
    expect(renameCancel).toBeOnTheScreen()
    expect(StyleSheet.flatten(sessionCopy.props.style).paddingRight).toBeUndefined()
    expect(StyleSheet.flatten(renameActions.props.style)).toMatchObject({ flexDirection: 'row', flexShrink: 0 })
    expect(StyleSheet.flatten(renameActions.props.style).position).toBeUndefined()
    expect(StyleSheet.flatten(renameCancel.props.style)).toMatchObject({ height: 30, width: 30 })
    expect(StyleSheet.flatten(renameSave.props.style)).toMatchObject({ height: 30, width: 30 })
  })
})
