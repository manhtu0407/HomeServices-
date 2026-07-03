import { readFileSync } from 'fs'
import { resolve } from 'path'

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf-8').replace(/\r\n/g, '\n')

describe('active customer Kael chat surface wiring', () => {
  it('exports the split Kael chat stack instead of the archived v21 chat surface', () => {
    const source = readSource('kael-chat/kael-chat-surface.tsx')

    expect(source).toContain('export function KaelChatSurface')
    expect(source).toContain('testID="customer-kael-chat-stack-screen"')
    expect(source).toContain('KaelChatThread')
    expect(source).not.toContain('CustomerV21KaelChatSurface')
    expect(source).not.toContain("from '../v21/surfaces'")
    expect(source).not.toContain('export { CustomerV21KaelChatSurface as KaelChatSurface }')
  })

  it('keeps full-screen green ambient washes out of the active Kael route', () => {
    const surface = readSource('kael-chat/kael-chat-surface.tsx')
    const styles = readSource('kael-chat/styles.ts')

    expect(surface).not.toContain('customer-kael-chat-liquid-wash')
    expect(surface).not.toContain('styles.chatAmbientField')
    expect(styles).not.toContain('chatAmbientMint')
    expect(styles).not.toContain('chatAmbientSweep')
  })
})
