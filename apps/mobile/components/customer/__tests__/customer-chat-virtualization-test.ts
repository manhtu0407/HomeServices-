import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Customer surfaces live in per-domain buckets, so resolve a file by name.
const CUSTOMER_BUCKETS = ['v21', 'dock', 'ui', 'home', 'booking', 'history', 'profile', 'kael-chat']
const customerV21Path = (fileName: string) => {
  const bucket = CUSTOMER_BUCKETS.find((dir) => existsSync(resolve(__dirname, '..', dir, fileName)))
  return resolve(__dirname, '..', bucket ?? 'v21', fileName)
}

describe('customer Kael chat transcript performance', () => {
  it('renders chat rows through a virtualized React Native list', () => {
    const viewSource = readFileSync(customerV21Path('chat-stateful-surfaces.tsx'), 'utf8')
    const transcriptPath = customerV21Path('kael-chat-transcript.tsx')
    const transcriptSource = existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : ''

    expect(`${viewSource}\n${transcriptSource}`).toContain('<FlatList')
    expect(viewSource).not.toContain('<ScrollView')
  })

  it('places completed local Case Work exchanges before the current phase surface', () => {
    const viewSource = readFileSync(customerV21Path('chat-stateful-surfaces.tsx'), 'utf8')
    const localTurnsIndex = viewSource.indexOf('for (const turn of caseAssistantTurns)')
    const currentEstimateIndex = viewSource.indexOf("appendChatTranscriptRow(rows, 'agentic-estimate'")

    expect(localTurnsIndex).toBeGreaterThanOrEqual(0)
    expect(currentEstimateIndex).toBeGreaterThanOrEqual(0)
    expect(localTurnsIndex).toBeLessThan(currentEstimateIndex)
  })

  it('keeps booking address lookup in one owner-scoped snapshot', () => {
    const surfaceSource = readFileSync(customerV21Path('surfaces.tsx'), 'utf8')
    const lookupPath = customerV21Path('use-booking-address-lookup.ts')
    const lookupSource = existsSync(lookupPath) ? readFileSync(lookupPath, 'utf8') : ''

    expect(surfaceSource).toContain('useBookingAddressLookup')
    expect(surfaceSource).not.toContain('setAddressLookupPending')
    expect(lookupSource).toContain('owner: BookingAddressLookupOwner | null')
    expect(lookupSource).toContain('snapshot.owner?.query')
  })
})
