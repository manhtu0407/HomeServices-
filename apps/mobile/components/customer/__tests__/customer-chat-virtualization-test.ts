import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const customerV21Path = (fileName: string) => resolve(__dirname, '..', 'v21', fileName)

describe('customer Kael chat transcript performance', () => {
  it('renders chat rows through a virtualized React Native list', () => {
    const viewSource = readFileSync(customerV21Path('chat-stateful-surfaces.tsx'), 'utf8')
    const transcriptPath = customerV21Path('chat-transcript.tsx')
    const transcriptSource = existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : ''

    expect(`${viewSource}\n${transcriptSource}`).toContain('<FlatList')
    expect(viewSource).not.toContain('<ScrollView')
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
