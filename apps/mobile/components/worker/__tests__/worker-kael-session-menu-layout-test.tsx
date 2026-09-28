import { fireEvent, render, screen } from '@testing-library/react-native'
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

jest.mock('@/components/ui/liquid-back-button', () => ({
  LiquidSurfaceOverlay: () => null,
}))

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
  it('expands the session menu and keeps the title editor within its available width', () => {
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
    expect(menuStyle.width).toBe('92%')
    expect(menuStyle.maxWidth).toBeLessThanOrEqual(440)
    expect(listStyle.maxHeight).toBeGreaterThan(138)
    expect(listStyle.maxHeight).toBeLessThanOrEqual(240)
    expect(input.props.selectTextOnFocus).toBeFalsy()
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ flex: 1, minWidth: 0, width: '100%' })
  })
})
