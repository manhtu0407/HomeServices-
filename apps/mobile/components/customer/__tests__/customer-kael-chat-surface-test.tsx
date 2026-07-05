import { readFileSync } from 'fs'
import { resolve } from 'path'

const readCustomerSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf-8').replace(/\r\n/g, '\n')
const readMobileSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '../../..', relativePath), 'utf-8').replace(/\r\n/g, '\n')

describe('active customer Kael chat surface wiring', () => {
  it('routes Customer Kael through the V21 surface instead of the deleted split stack', () => {
    const kaelRoute = readMobileSource('app/(customer)/kael.tsx')
    const kaelChatRoute = readMobileSource('app/(customer)/kael-chat.tsx')
    const bridge = readCustomerSource('customer-surfaces.tsx')
    const surface = readCustomerSource('v21/surfaces.tsx')
    const chatView = readCustomerSource('v21/chat-stateful-surfaces.tsx')

    expect(kaelRoute).toContain('CustomerKaelSurface')
    expect(kaelRoute).toContain('@/components/customer/customer-surfaces')
    expect(kaelChatRoute).toContain('CustomerKaelSurface')
    expect(kaelChatRoute).toContain('@/components/customer/customer-surfaces')
    expect(kaelRoute).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(kaelChatRoute).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(bridge).toContain('CustomerKaelSurface')
    expect(surface).toContain('export function KaelChatSurface')
    expect(chatView).toContain('testID="customer-v21-kael-chat"')
    expect(chatView).toContain('customer-v21-screen-2.4-chat-normal')
    expect(chatView).not.toContain('customer-kael-chat-stack-screen')
  })

  it('keeps full-screen mint washes soft on the active V21 Kael route', () => {
    const canvas = readCustomerSource('v21/chat-surfaces.tsx')
    const shared = readCustomerSource('v21/shared-surfaces.tsx')

    expect(canvas).toContain('customer-v21-chat-canvas-aura')
    expect(canvas).not.toContain('rgba(136,235,221,0.34)')
    expect(canvas).not.toContain('rgba(13,174,154,0.22)')
    expect(shared).toContain('{ backgroundColor: tokens.canvas }')
  })
})
