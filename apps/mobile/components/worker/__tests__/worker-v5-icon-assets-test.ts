import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('worker V5 icon assets', () => {
  it('uses the dedicated reconciliation-folio image for the earnings hero', () => {
    const iconAssetsSource = readFileSync(resolve(__dirname, '../ui/worker-v5-icon-assets.ts'), 'utf8')
    const folioPath = resolve(__dirname, '../../../assets/worker-image-icons/earnings-reconciliation-folio.png')

    expect(existsSync(folioPath)).toBe(true)
    expect(iconAssetsSource).toContain("earningsHero: require('@/assets/worker-image-icons/earnings-reconciliation-folio.png')")
    expect(iconAssetsSource).not.toContain("earningsHero: require('@/assets/worker-image-icons/utility-earnings-wallet-core.png')")
  })

  it('uses the dedicated service-kit image for the active-skills hero', () => {
    const iconAssetsSource = readFileSync(resolve(__dirname, '../ui/worker-v5-icon-assets.ts'), 'utf8')
    const workerFlowSource = readFileSync(resolve(__dirname, '../worker-v5-flow.tsx'), 'utf8')
    const serviceKitPath = resolve(__dirname, '../../../assets/worker-image-icons/skills-service-kit.png')

    expect(existsSync(serviceKitPath)).toBe(true)
    expect(iconAssetsSource).toContain("skillsHero: require('@/assets/worker-image-icons/skills-service-kit.png')")
    expect(iconAssetsSource).not.toContain("skillsHero: require('@/assets/worker-image-icons/utility-tools.png')")
    expect(workerFlowSource).toContain('skillsGridEmptyIcon={workerV5Icons.tools}')
  })

  it('uses the dedicated map-kit image for the skills-and-area home quick action', () => {
    const iconAssetsSource = readFileSync(resolve(__dirname, '../ui/worker-v5-icon-assets.ts'), 'utf8')
    const mapKitPath = resolve(__dirname, '../../../assets/worker-image-icons/home-quick-skills-area-map-kit.png')

    expect(existsSync(mapKitPath)).toBe(true)
    expect(iconAssetsSource).toContain("homeQuickSkillsArea: require('@/assets/worker-image-icons/home-quick-skills-area-map-kit.png')")
    expect(iconAssetsSource).not.toContain("homeQuickSkillsArea: require('@/assets/worker-image-icons/utility-scope-core.png')")
  })

  it('uses dedicated offer images for the worker offer-detail route', () => {
    const workerFlowSource = readFileSync(resolve(__dirname, '../worker-v5-flow.tsx'), 'utf8')
    const assets = [
      ['offer-private-entry.png', 'map'],
      ['offer-customer-handoff.png', 'profile'],
      ['offer-scope-modules.png', 'document'],
      ['offer-acceptance-window.png', 'clock'],
    ] as const

    for (const [fileName, iconName] of assets) {
      const assetPath = resolve(__dirname, `../../../assets/worker-image-icons/${fileName}`)

      expect(existsSync(assetPath)).toBe(true)
      expect(workerFlowSource).toContain(`${iconName}: require('@/assets/worker-image-icons/${fileName}')`)
    }

    expect(workerFlowSource).toContain('iconSources={workerV5OfferDetailIcons}')
    expect(workerFlowSource).toContain('clockIcon={workerV5OfferDetailIcons.clock}')
  })

  it('renders the offer-detail images without white icon tiles', () => {
    const offerSurfaceSource = readFileSync(resolve(__dirname, '../jobs/offer-surfaces.tsx'), 'utf8')
    const offerStylesSource = readFileSync(resolve(__dirname, '../jobs/offer-styles.ts'), 'utf8')
    const acceptanceSurfaceSource = readFileSync(resolve(__dirname, '../jobs/acceptance-surfaces.tsx'), 'utf8')
    const acceptanceStylesSource = readFileSync(resolve(__dirname, '../jobs/acceptance-styles.ts'), 'utf8')

    expect(offerSurfaceSource).not.toContain('offerDetailRowIconTile')
    expect(offerStylesSource).not.toContain('offerDetailRowIconTile:')
    expect(acceptanceSurfaceSource).not.toContain('acceptCommitmentIconTile')
    expect(acceptanceStylesSource).not.toContain('acceptCommitmentIconTile:')
  })

  it('uses an unboxed arrival signal icon for the empty offer summary', () => {
    const workerFlowSource = readFileSync(resolve(__dirname, '../worker-v5-flow.tsx'), 'utf8')
    const offerSurfaceSource = readFileSync(resolve(__dirname, '../jobs/offer-surfaces.tsx'), 'utf8')
    const offerStylesSource = readFileSync(resolve(__dirname, '../jobs/offer-styles.ts'), 'utf8')
    const assetPath = resolve(__dirname, '../../../assets/worker-image-icons/offer-arrival-signal.png')
    const emptyCardSource = offerSurfaceSource.slice(
      offerSurfaceSource.indexOf('export function WorkerV5OfferDetailEmptyCard'),
      offerSurfaceSource.indexOf('export function WorkerV5OfferDetailListCard'),
    )

    expect(existsSync(assetPath)).toBe(true)
    expect(workerFlowSource).toContain("workerV5OfferDetailEmptyIcon = require('@/assets/worker-image-icons/offer-arrival-signal.png')")
    expect(workerFlowSource).toContain('emptyOfferIcon={workerV5OfferDetailEmptyIcon}')
    expect(emptyCardSource).toContain('style={styles.offerDetailEmptySummaryLine}')
    expect(emptyCardSource).toContain('source={emptyOfferIcon}')
    expect(emptyCardSource).toContain('style={styles.offerDetailEmptyIcon}')
    expect(emptyCardSource).not.toContain('offerDetailIconTile')
    expect(emptyCardSource).not.toContain('offerDetailStatusChip')
    expect(offerStylesSource).toContain('offerDetailEmptySummaryLine:')
    expect(offerStylesSource).toContain('minHeight: 104')
  })

  it('keeps the empty offer detail focused on Vietnamese, worker-facing copy', () => {
    const workerFlowSource = readFileSync(resolve(__dirname, '../worker-v5-flow.tsx'), 'utf8')
    const offerSource = readFileSync(resolve(__dirname, '../jobs/offer.ts'), 'utf8')
    const offerSurfaceSource = readFileSync(resolve(__dirname, '../jobs/offer-surfaces.tsx'), 'utf8')
    const acceptanceSurfaceSource = readFileSync(resolve(__dirname, '../jobs/acceptance-surfaces.tsx'), 'utf8')
    const acceptanceStylesSource = readFileSync(resolve(__dirname, '../jobs/acceptance-styles.ts'), 'utf8')

    expect(offerSource).toContain("'Chưa có khách hàng nào được gửi tới thợ.'")
    expect(offerSource).toContain("'Liên hệ và thanh toán được xử lý trong ứng dụng.'")
    expect(offerSource).toContain("'Yêu cầu sẽ hiện khi có cơ hội phù hợp.'")
    expect(offerSource).not.toContain("'NestScout chưa gửi khách hàng nào tới thợ.'")
    expect(offerSource).not.toContain("'Yêu cầu sẽ hiện khi backend đồng bộ cơ hội.'")
    expect(offerSurfaceSource).toContain("'Chi tiết sẽ hiện khi có cơ hội phù hợp.'")
    expect(offerSurfaceSource).not.toContain("'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.'")
    expect(acceptanceSurfaceSource).toContain("'Chi tiết sẽ hiện khi có cơ hội phù hợp.'")
    expect(workerFlowSource).not.toContain('WorkerV5AcceptBoundaryNote')
    expect(acceptanceSurfaceSource).not.toContain('WorkerV5AcceptBoundaryNote')
    expect(acceptanceStylesSource).not.toContain('acceptBoundary')
  })

  it('uses dedicated, distinct icons for work response and transparent incident handling', () => {
    const iconAssetsSource = readFileSync(resolve(__dirname, '../ui/worker-v5-icon-assets.ts'), 'utf8')
    const responsePath = resolve(__dirname, '../../../assets/worker-image-icons/ranking-work-response-core.png')
    const incidentPath = resolve(__dirname, '../../../assets/worker-image-icons/ranking-incident-resolution-core.png')

    expect(existsSync(responsePath)).toBe(true)
    expect(existsSync(incidentPath)).toBe(true)
    expect(iconAssetsSource).toContain("rankingWorkResponse: require('@/assets/worker-image-icons/ranking-work-response-core.png')")
    expect(iconAssetsSource).toContain("rankingIncidentHandling: require('@/assets/worker-image-icons/ranking-incident-resolution-core.png')")
    expect(iconAssetsSource).toContain('work_response: workerV5CapturedIconAssets.rankingWorkResponse')
    expect(iconAssetsSource).toContain('incident_handling: workerV5CapturedIconAssets.rankingIncidentHandling')
  })
})
