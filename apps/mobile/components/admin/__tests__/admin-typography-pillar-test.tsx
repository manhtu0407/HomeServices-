import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen, within } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { AdminViewActor } from '@/lib/api-types/admin'

import { adminProductionPresentationCopy, findAdminProductionSection } from '../admin-sections-production-copy'
import { AdminProductionSectionIndex } from '../admin-sections-production-workspace'
import { AdminSystemDetailHeader } from '../admin-system-controls'
import { AdminText } from '../admin-text'

export const PILLAR = {
  id: 'P47-admin-semantic-typography',
  invariant:
    'Production Admin text declares a semantic Dynamic Type ramp, uses the platform system font with automatic iOS tracking, and renders operational numbers with tabular numerals',
  authority: [
    'Apple Human Interface Guidelines — Typography and Accessibility',
    'apps/mobile/design/theme.ts Apple semantic typography contract',
    'user-approved Admin Overview detail and typography implementation plan',
  ],
  target: 'apps/mobile/components/admin/admin-text.tsx',
  layer: 'ui-visual',
  siblings: ['P28-text-scale-reflow', 'P45-admin-overview-dashboard'],
  mutation:
    'remove allowFontScaling, retain manual iOS letterSpacing, or omit tabular-nums for numeric text — the primitive contract turns red',
} as const satisfies PillarManifest

describe('AdminText semantic contract', () => {
  it('binds role, Dynamic Type, system font, and automatic iOS tracking in one primitive', () => {
    render(<AdminText textRole="title2" testID="admin-heading">Vận hành</AdminText>)

    const heading = screen.getByTestId('admin-heading')
    const style = StyleSheet.flatten(heading.props.style)
    expect(heading.props.allowFontScaling).toBe(true)
    expect(heading.props.dynamicTypeRamp).toBe('title2')
    if (Platform.OS === 'ios') {
      expect(style.fontFamily).toBeUndefined()
      expect(style.letterSpacing).toBeUndefined()
    }
  })

  it('uses tabular numerals without changing the requested semantic ramp', () => {
    render(<AdminText numeric textRole="title1" testID="admin-number">33</AdminText>)

    const number = screen.getByTestId('admin-number')
    expect(number.props.dynamicTypeRamp).toBe('title1')
    expect(StyleSheet.flatten(number.props.style).fontVariant).toContain('tabular-nums')
  })

  it('does not permit a caller style to reintroduce manual iOS tracking or an embedded font', () => {
    render(<AdminText textRole="body" style={{ fontFamily: 'SF-Pro-Bundled', letterSpacing: 8 }} testID="admin-policy">Nội dung</AdminText>)

    const style = StyleSheet.flatten(screen.getByTestId('admin-policy').props.style)
    withPillarContext(PILLAR, () => {
      if (Platform.OS === 'ios') {
        expect(style.fontFamily).toBeUndefined()
        expect(style.letterSpacing).toBeUndefined()
      } else {
        expect(style.fontFamily).toBe('System')
      }
    }, 'Admin typography policy must be the final style layer')
  })

  it('uses one semantic hierarchy across every specialist route and System detail', () => {
    const actor: AdminViewActor = { access_level: 'owner', capabilities: [] }
    for (const sectionId of ['operations', 'workers', 'finance', 'team', 'system'] as const) {
      const section = findAdminProductionSection('vi', sectionId)
      const capability = section.capabilities[0]
      const view = render(
        <AdminProductionSectionIndex
          actor={actor}
          language="vi"
          onOpenCapability={jest.fn()}
          refreshing={false}
          section={section}
        />,
      )
      const row = within(screen.getByTestId(`admin-production-capability-${capability.id}`))

      expect(row.getByText(capability.title).props.dynamicTypeRamp).toBe('headline')
      expect(row.getByText(capability.useWhen).props.dynamicTypeRamp).toBe('subheadline')
      expect(row.getAllByText('Chủ hệ thống · Quản lý')[0].props.dynamicTypeRamp).toBe('footnote')
      expect(row.getByText(adminProductionPresentationCopy.vi.status[capability.status]).props.dynamicTypeRamp).toBe('footnote')
      view.unmount()
    }

    render(<AdminSystemDetailHeader language="vi" subtitle="Dữ liệu hiện tại" title="Chi tiết giá tham chiếu" />)
    expect(screen.getByText('Chi tiết giá tham chiếu').props.dynamicTypeRamp).toBe('title2')
  })

  it('routes every Production Admin text node through an explicit semantic role', () => {
    const adminDirectory = join(__dirname, '..')
    const productionFiles = readdirSync(adminDirectory).filter((fileName) => (
      fileName.endsWith('.tsx')
      && fileName !== 'admin-text.tsx'
      && !fileName.includes('prototype')
    ))

    withPillarContext(PILLAR, () => {
      for (const fileName of productionFiles) {
        const source = readFileSync(join(adminDirectory, fileName), 'utf8')
        expect(source).not.toMatch(/<Text(?:\s|>)/)
        expect(source).not.toMatch(/\b(?:fontFamily|fontSize|letterSpacing|lineHeight)\s*:/)
        expect(source).not.toContain('numberOfLines=')
        for (const match of source.matchAll(/<AdminText\b([^>]*)>/gs)) {
          expect(match[1]).toMatch(/\btextRole="(?:largeTitle|title1|title2|title3|headline|body|callout|subheadline|footnote|caption1|caption2|tabularBody)"/)
        }
      }
    }, 'Production Admin surfaces must not bypass AdminText or reintroduce local font metrics')
  })
})
