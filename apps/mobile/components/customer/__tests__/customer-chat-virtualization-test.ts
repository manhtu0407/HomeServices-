import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Virtualization, row order, and the address-lookup snapshot are all observable
// in a mounted tree, and the surface tests cover them there. Asserting the index
// of one string against another inside a source file was the most fragile form
// of that claim, and it is gone. What stays is the pair of regressions that only
// absence can express: the ScrollView this transcript must never fall back to,
// and the per-field pending setter the single-snapshot lookup replaced.
const CUSTOMER_BUCKETS = ['v21', 'dock', 'ui', 'home', 'booking', 'history', 'profile', 'kael-chat']
const customerV21Path = (fileName: string) => {
  const bucket = CUSTOMER_BUCKETS.find((dir) => existsSync(resolve(__dirname, '..', dir, fileName)))
  return resolve(__dirname, '..', bucket ?? 'v21', fileName)
}

describe('customer Kael chat transcript performance', () => {
  it('never falls back to a non-virtualized transcript', () => {
    expect(readFileSync(customerV21Path('chat-stateful-surfaces.tsx'), 'utf8'))
      .not.toContain('<ScrollView')
  })

  it('keeps booking address lookup in one owner-scoped snapshot', () => {
    expect(readFileSync(customerV21Path('surfaces.tsx'), 'utf8'))
      .not.toContain('setAddressLookupPending')
  })
})
