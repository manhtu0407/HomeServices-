import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Two claims survive as file reads. A missing PNG breaks `require()` at module
// load, so existence is a real property of the asset tree and no render test
// reaches it earlier. And a style tile, a boundary note, or a replaced copy
// string that must never come back is absence — absent code renders nothing.
// Which icon a surface shows, and what copy it puts on screen, is covered by the
// worker surface tests that mount the components.
const asset = (fileName: string) =>
  resolve(__dirname, `../../../assets/worker-image-icons/${fileName}`)
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

describe('worker V5 icon assets', () => {
  it.each([
    'earnings-transaction-history-core.png',
    'earnings-receiving-account-core.png',
    'earnings-commission-policy-core.png',
    'skills-service-kit.png',
    'home-quick-skills-area-map-kit.png',
    'offer-private-entry.png',
    'offer-customer-handoff.png',
    'offer-scope-modules.png',
    'offer-acceptance-window.png',
    'offer-arrival-signal.png',
    'ranking-work-response-core.png',
    'ranking-incident-resolution-core.png',
  ])('ships the production image %s that the icon map requires', (fileName) => {
    expect(existsSync(asset(fileName))).toBe(true)
  })

  it('keeps the retired earnings entries out of the icon map', () => {
    const iconAssetsSource = read('../ui/worker-v5-icon-assets.ts')

    expect(iconAssetsSource).not.toContain('earningsHero:')
    expect(iconAssetsSource).not.toContain('earningsRecentTransactions:')
    expect(iconAssetsSource).not.toContain("skillsHero: require('@/assets/worker-image-icons/utility-tools.png')")
    expect(iconAssetsSource).not.toContain("homeQuickSkillsArea: require('@/assets/worker-image-icons/utility-scope-core.png')")
  })

  it('renders the offer-detail images without white icon tiles', () => {
    expect(read('../jobs/offer-surfaces.tsx')).not.toContain('offerDetailRowIconTile')
    expect(read('../jobs/offer-styles.ts')).not.toContain('offerDetailRowIconTile:')
    expect(read('../jobs/acceptance-surfaces.tsx')).not.toContain('acceptCommitmentIconTile')
    expect(read('../jobs/acceptance-styles.ts')).not.toContain('acceptCommitmentIconTile:')
  })

  it('keeps the replaced worker-facing copy and the accept boundary note gone', () => {
    const offerSource = read('../jobs/offer.ts')

    expect(offerSource).not.toContain("'NestScout chưa gửi khách hàng nào tới thợ.'")
    expect(offerSource).not.toContain("'Yêu cầu sẽ hiện khi backend đồng bộ cơ hội.'")
    expect(read('../jobs/offer-surfaces.tsx')).not.toContain("'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.'")
    expect(read('../worker-v5-flow.tsx')).not.toContain('WorkerV5AcceptBoundaryNote')
    expect(read('../jobs/acceptance-surfaces.tsx')).not.toContain('WorkerV5AcceptBoundaryNote')
    expect(read('../jobs/acceptance-styles.ts')).not.toContain('acceptBoundary')
  })
})
