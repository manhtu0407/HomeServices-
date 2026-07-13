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
