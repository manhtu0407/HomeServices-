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
const clientImageAsset = (fileName: string) =>
  resolve(__dirname, `../../../assets/client-image-icons/${fileName}`)
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

  it('keeps the rebuilt offer surface free of retired icon tiles', () => {
    const offerSource = read('../jobs/worker-jobs-zip-prototype-surface.tsx')

    expect(offerSource).not.toContain('offerDetailRowIconTile')
    expect(offerSource).not.toContain('acceptCommitmentIconTile')
  })

  it('uses true-alpha Workart for every Jobs opportunity service', () => {
    const opportunitySource = [
      read('../jobs/worker-jobs-zip-prototype-shared.tsx'),
      read('../jobs/worker-jobs-zip-prototype-early-stages.tsx'),
      read('../jobs/worker-jobs-zip-prototype-work-stages.tsx'),
    ].join('\n')

    expect(existsSync(clientImageAsset('client-booking-journey-workart-cutout.png'))).toBe(true)
    expect(opportunitySource).toContain('client-booking-journey-workart-cutout.png')
    expect(opportunitySource).not.toContain("client-booking-journey-workart.png')")

    for (const service of ['electrical', 'plumbing', 'cleaning', 'hvac', 'handyman', 'upholstery']) {
      const assetName = `worker-jobs-workart-${service}-transparent.png`
      expect(existsSync(clientImageAsset(assetName))).toBe(true)
      expect(opportunitySource).toContain(assetName)
      expect(opportunitySource).not.toContain(`client-booking-workart-${service}.png`)
    }

    expect(existsSync(clientImageAsset('worker-stage-seven-approval-workart-transparent.png'))).toBe(true)
    expect(opportunitySource).toContain('worker-stage-seven-approval-workart-transparent.png')
    expect(opportunitySource).not.toContain('worker-stage-seven-approval-workart.png')
  })

  it('keeps the replaced worker-facing copy and the accept boundary note gone', () => {
    const offerSource = read('../jobs/offer.ts')

    expect(offerSource).not.toContain("'NestScout chưa gửi khách hàng nào tới thợ.'")
    expect(offerSource).not.toContain("'Yêu cầu sẽ hiện khi backend đồng bộ cơ hội.'")
    expect(read('../jobs/worker-jobs-zip-prototype-surface.tsx')).not.toContain("'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.'")
    expect(read('../worker-v5-flow.tsx')).not.toContain('WorkerV5AcceptBoundaryNote')
    expect(read('../jobs/worker-jobs-zip-prototype-surface.tsx')).not.toContain('WorkerV5AcceptBoundaryNote')
  })
})
