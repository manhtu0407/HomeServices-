import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { AdminViewActor } from '@/lib/api-types/admin'

import { adminProductionPresentationCopy } from '../admin-sections-production-copy'
import { AdminSectionsProductionShell } from '../admin-sections-production-shell'
import {
  ADMIN_PRODUCTION_SECTIONS,
  resolveAdminProductionCapability,
  resolveAdminProductionRoute,
  visibleAdminProductionSections,
} from '../admin-sections-production-registry'

export const PILLAR = {
  id: 'P44-admin-production-sections',
  invariant:
    'the real Admin surface has exactly six permission-gated sections, preserves legacy deep links, and never routes a visible Production section through Prototype data',
  authority: [
    'user-approved Admin redesign plan (six Production sections, no mock data, existing functions unchanged)',
    'governance/RULES.md #5 and #8 (server authority and honest data)',
    'governance/structures/admin-workflow.md (human-controlled Admin capabilities)',
  ],
  target: 'apps/mobile/components/admin/admin-sections-production-registry.ts',
  layer: 'ui-visual',
  siblings: ['P34-admin-finance-bank-reference', 'P42-auth-session-shell'],
  mutation:
    'map the legacy withdrawals deep link to Operations or add a seventh registry item — the route and exact-order assertions turn red',
} as const satisfies PillarManifest

const owner = {
  access_level: 'owner',
  capabilities: [
    'operations.read',
    'transactions.read',
    'workers.read',
    'finance.read',
    'payouts.read',
    'team.read',
  ],
} as AdminViewActor

describe('Admin Production section registry', () => {
  it('keeps every Production Admin scrollbar track transparent without disabling scrolling', () => {
    const scrollOwners = [
      '../admin-overview-detail-sheet.tsx',
      '../admin-production-capability-sheet.tsx',
      '../admin-sections-production-shell.tsx',
      '../admin-sections-support.tsx',
      '../admin-tab-navigation.tsx',
      '../admin-team-owner-actions.tsx',
      '../admin-worker-review-modal.tsx',
    ]

    withPillarContext(PILLAR, () => {
      for (const scrollOwner of scrollOwners) {
        const source = readFileSync(join(__dirname, scrollOwner), 'utf8')
        const scrollViews = source.match(/<ScrollView\b[\s\S]*?>/g) ?? []
        expect(scrollViews.length).toBeGreaterThan(0)
        for (const scrollView of scrollViews) {
          if (/\bhorizontal(?:\s|=)/.test(scrollView)) {
            expect(scrollView).toContain('showsHorizontalScrollIndicator={false}')
          } else {
            expect(scrollView).toContain('showsVerticalScrollIndicator={false}')
          }
        }
      }
    }, 'Admin scrolling remains available while native and web indicator tracks stay visually absent')
  })

  it('contains no polling or focus-triggered reload in any Production Admin data owner', () => {
    const dataOwners = [
      '../admin-sections.tsx',
      '../admin-overview-dashboard.tsx',
      '../admin-finance.tsx',
      '../admin-payouts.tsx',
      '../admin-governance.tsx',
      '../admin-scope-change-monitor.tsx',
      '../admin-support-case-center.tsx',
      '../admin-system-workspace.tsx',
      '../admin-team-workspace.tsx',
    ]

    withPillarContext(PILLAR, () => {
      for (const dataOwner of dataOwners) {
        const source = readFileSync(join(__dirname, dataOwner), 'utf8')
        expect(source).not.toMatch(/\bsetInterval\s*\(/)
        expect(source).not.toContain('useFocusEffect')
        expect(source).not.toContain("AppState.addEventListener('change'")
      }
    }, 'Production Admin reads may run on entry or explicit user actions, never from timers or focus changes')
  })

  it('defines the approved six-section hierarchy in one stable order', () => {
    withPillarContext(PILLAR, () => {
      expect(ADMIN_PRODUCTION_SECTIONS.map((section) => section.id)).toEqual([
        'overview',
        'operations',
        'workers',
        'finance',
        'team',
        'system',
      ])
      expect(ADMIN_PRODUCTION_SECTIONS.every((section) => !section.modulePath.includes('prototype'))).toBe(true)
    }, 'Production navigation must have the approved six destinations and no Prototype module path')
  })

  it('keeps all six sections available to an authorized Owner', () => {
    withPillarContext(PILLAR, () => {
      expect(visibleAdminProductionSections(owner).map((section) => section.id)).toEqual([
        'overview',
        'operations',
        'workers',
        'finance',
        'team',
        'system',
      ])
    }, 'the Owner has every required read capability and must see the complete Admin hierarchy')
  })

  it('renders all six compact routes in one equal-width, non-scrolling row', () => {
    const navigation = ADMIN_PRODUCTION_SECTIONS.map((section) => ({
      id: section.id,
      label: adminProductionPresentationCopy.vi.sections.find((candidate) => candidate.id === section.id)?.shortLabel ?? section.id,
      testID: `admin-route-${section.id}`,
    }))

    render(<AdminSectionsProductionShell
      activeSection="team"
      navigation={navigation}
      navigationLabel="Khu vực quản trị"
      onSelectSection={jest.fn()}
      onSignOut={jest.fn()}
      signOutLabel="Đăng xuất"
      title="Điều hành NestScout"
    >
      {null}
    </AdminSectionsProductionShell>)

    withPillarContext(PILLAR, () => {
      expect(screen.getAllByRole('tab')).toHaveLength(6)
      expect(screen.getByTestId('admin-sections-primary-navigation-scroll')).toHaveStyle({
        flexDirection: 'row',
        width: '100%',
      })
      for (const section of ADMIN_PRODUCTION_SECTIONS) {
        expect(screen.getByTestId(`admin-route-${section.id}`)).toHaveStyle({
          flexBasis: 0,
          flexGrow: 1,
          minWidth: 0,
        })
      }
    }, 'the compact navigation must distribute six routes across the viewport instead of clipping the last route in a horizontal list')
  })

  it('shows a finance-baseline operator Finance and read-only System', () => {
    const financeOperator = {
      access_level: 'operator',
      capabilities: ['finance.read'],
    } as AdminViewActor

    withPillarContext(PILLAR, () => {
      expect(visibleAdminProductionSections(financeOperator).map((section) => section.id)).toEqual(['finance', 'system'])
    }, 'every active Manager receives the finance.read baseline and may inspect the read-only System route')
  })

  it('keeps Finance available to an operator whose only responsibility is payouts', () => {
    const payoutOperator = {
      access_level: 'operator',
      capabilities: ['payouts.read'],
    } as AdminViewActor

    withPillarContext(PILLAR, () => {
      expect(visibleAdminProductionSections(payoutOperator).map((section) => section.id)).toEqual(['finance'])
    }, 'moving payouts under Finance must not remove a payout-only operator from their authorized surface')
  })

  it('keeps Overview dedicated and defines the 22 real capabilities for the five specialist sections', () => {
    withPillarContext(PILLAR, () => {
      for (const language of ['vi', 'en'] as const) {
        const sections = adminProductionPresentationCopy[language].sections
        const capabilityIds = sections.flatMap((section) => section.capabilities.map((capability) => capability.id))
        expect(sections.map((section) => section.id)).toEqual(ADMIN_PRODUCTION_SECTIONS.map((section) => section.id))
        expect(sections.find((section) => section.id === 'overview')).toMatchObject({ capabilities: [], workstreams: [] })
        expect(capabilityIds).toHaveLength(22)
        expect(new Set(capabilityIds).size).toBe(22)
        expect(capabilityIds).toEqual(expect.arrayContaining([
          'operations-scope-change',
          'system-taxonomy',
          'team-provisioning',
          'finance-reconciliation',
          'workers-discipline',
          'workers-ambassador',
        ]))
      }
    }, 'Production must preserve the approved information architecture while real services remain the only data source')
  })

  it.each([
    [{}, { section: 'overview', financeWorkspace: 'reports', payoutTab: 'accounts' }],
    [{ ns_admin_section: 'transactions' }, { section: 'operations', financeWorkspace: 'reports', payoutTab: 'accounts' }],
    [{ ns_admin_section: 'operations' }, { section: 'operations', financeWorkspace: 'reports', payoutTab: 'accounts' }],
    [{ ns_admin_section: 'workers' }, { section: 'workers', financeWorkspace: 'reports', payoutTab: 'accounts' }],
    [{ ns_admin_section: 'finance', ns_finance_view: 'tax' }, { section: 'finance', financeWorkspace: 'reports', payoutTab: 'accounts' }],
    [{ ns_admin_section: 'withdrawals' }, { section: 'finance', financeWorkspace: 'payouts', payoutTab: 'withdrawals' }],
    [{ ns_admin_section: 'governance' }, { section: 'system', financeWorkspace: 'reports', payoutTab: 'accounts' }],
    [{ panel: 'finance' }, { section: 'finance', financeWorkspace: 'reports', payoutTab: 'accounts' }],
  ] as const)('preserves route input %o', (params, expected) => {
    withPillarContext(PILLAR, () => {
      expect(resolveAdminProductionRoute(params)).toEqual(expected)
    }, `legacy route ${JSON.stringify(params)} must resolve without changing its real destination`)
  })

  it.each([
    [{ ns_admin_section: 'transactions' }, 'operations-service-transactions'],
    [{ ns_admin_section: 'withdrawals' }, 'finance-payouts'],
    [{ ns_admin_section: 'workers' }, null],
    [{ ns_admin_section: 'finance' }, null],
    [{ ns_admin_section: 'finance', ns_finance_view: 'tax' }, 'finance-tax'],
    [{ ns_admin_section: 'team' }, null],
    [{ ns_admin_section: 'governance' }, 'system-price-baseline'],
    [{ ns_admin_section: 'operations' }, null],
    [{ panel: 'workers' }, 'workers-applications'],
    [{ panel: 'finance' }, 'finance-overview'],
    [{ panel: 'team' }, 'team-directory'],
  ] as const)('opens the correct real workspace for legacy route %o', (params, expected) => {
    withPillarContext(PILLAR, () => {
      expect(resolveAdminProductionCapability(params)).toBe(expected)
    }, `legacy route ${JSON.stringify(params)} must open a real workspace or the section index`)
  })

  it('preserves the specialist capability selected by Overview while rejecting unknown capability params', () => {
    withPillarContext(PILLAR, () => {
      expect(resolveAdminProductionCapability({
        ns_admin_capability: 'operations-job-monitor',
        ns_admin_section: 'operations',
      })).toBe('operations-job-monitor')
      expect(resolveAdminProductionCapability({
        ns_admin_capability: 'not-a-production-capability',
        ns_admin_section: 'operations',
      })).toBeNull()
    }, 'Overview must keep its filtered specialist workspace without accepting arbitrary route values')
  })
})
