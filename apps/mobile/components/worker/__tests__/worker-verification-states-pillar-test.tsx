import { render, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import {
  WorkerV5VerificationChecklist,
  WorkerV5VerificationHero,
} from '../profile/verification-surfaces'

export const PILLAR = {
  id: 'P07-worker-verification-states',
  invariant:
    'a worker reads as ready for work only when every document check is recorded AND an admin has approved the profile; documents alone never unlock it',
  authority: [
    'governance/STRUCTURES.md §3 (workers are approved manually by admin)',
    'governance/RULES.md #8 (empty states, never fabricated counts)',
    'governance/protocols/frontend-test.md G2 (state coverage, Reduce Transparency)',
  ],
  target: 'apps/mobile/components/worker/profile/verification-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P06-payment-unlock-gate', 'P08-worker-dock-motion'],
  mutation:
    'drop the `Boolean(profile?.is_approved)` conjunct from the hero `ready` expression — the documents-complete-but-unapproved case turns red',
} as const satisfies PillarManifest

const ICON_NAMES = [
  'calendar', 'camera', 'chat', 'clock', 'document', 'earnings', 'evidence', 'home',
  'jobs', 'map', 'profile', 'shield', 'scope', 'tools', 'wallet',
] as const satisfies readonly WorkerV5IconName[]

const ICONS = Object.fromEntries(
  ICON_NAMES.map((name) => [name, { uri: `test://${name}` }]),
) as Record<WorkerV5IconName, ImageSourcePropType>

function StubAura({ testID }: { scope: string; testID?: string }) {
  return <View testID={testID} />
}

const profileOf = (patch: Partial<WorkerProfileResponse>) => patch as WorkerProfileResponse

const FULLY_DOCUMENTED = profileOf({
  has_cccd: true,
  has_selfie: true,
  selected_service_types: ['electrical'],
  verification_status: 'approved',
})

function mountHero(overrides: {
  language?: 'vi' | 'en'
  profile?: WorkerProfileResponse | null
  reduceTransparency?: boolean
} = {}) {
  return render(
    <WorkerV5VerificationHero
      icons={ICONS}
      language={overrides.language ?? 'vi'}
      profile={overrides.profile ?? null}
      reduceTransparency={overrides.reduceTransparency ?? true}
    />,
  )
}

function mountChecklist(profile: WorkerProfileResponse | null) {
  return render(
    <WorkerV5VerificationChecklist
      caseWideAura={StubAura}
      iconVisualBoost={new Set<WorkerV5IconName>()}
      icons={ICONS}
      language="vi"
      profile={profile}
      reduceTransparency
      zipAura={StubAura}
    />,
  )
}

describe('WorkerV5VerificationHero', () => {
  it('reports an honest zero count when no profile has loaded', () => {
    mountHero({ profile: null })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-count')).toHaveTextContent('0/4 mục đã ghi')
        expect(screen.getByTestId('worker-v5-verification-title')).toHaveTextContent('Cần hoàn tất xác minh')
      },
      'an absent profile must show a real 0 of 4, never a partial or invented figure',
    )
  })

  it('counts only the checks that are actually recorded', () => {
    mountHero({ profile: profileOf({ has_cccd: true }) })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-count')).toHaveTextContent('1/4 mục đã ghi')
      },
      'one recorded document out of four',
    )
  })

  // Document completeness is self-reported; approval is an admin act. Collapsing the two
  // would let a worker who filled in every field appear dispatchable.
  it('withholds the ready state when every document is recorded but approval has not landed', () => {
    mountHero({ profile: profileOf({ ...FULLY_DOCUMENTED, is_approved: false }) })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-count')).toHaveTextContent('4/4 mục đã ghi')
        expect(screen.getByTestId('worker-v5-verification-title')).toHaveTextContent('Cần hoàn tất xác minh')
      },
      '4/4 documents with is_approved=false must not read as Sẵn sàng nhận việc',
    )
  })

  it('shows the ready state only once documents and approval agree', () => {
    mountHero({ profile: profileOf({ ...FULLY_DOCUMENTED, is_approved: true }) })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-title')).toHaveTextContent('Sẵn sàng nhận việc')
      },
      'both signals present is the only ready path',
    )
  })

  it.each([
    ['hides', true, true],
    ['shows', false, false],
  ])('%s the mint aura when Reduce Transparency is %s', (_label, reduceTransparency, hidden) => {
    mountHero({ profile: FULLY_DOCUMENTED, reduceTransparency })
    withPillarContext(
      PILLAR,
      () => {
        const aura = screen.queryByTestId('worker-v5-verification-mint-aura')
        expect(hidden ? aura === null : aura !== null).toBe(true)
      },
      'Reduce Transparency must swap the translucent layer for an opaque card',
    )
  })

  it('renders English copy without leaking Vietnamese strings', () => {
    mountHero({ language: 'en', profile: profileOf({ ...FULLY_DOCUMENTED, is_approved: true }) })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-title')).toHaveTextContent('Ready for work')
        expect(screen.queryByText('Sẵn sàng nhận việc')).toBeNull()
      },
      'one language per selected mode',
    )
  })
})

describe('WorkerV5VerificationChecklist', () => {
  it('lists every check as waiting when nothing is recorded', () => {
    mountChecklist(null)
    withPillarContext(
      PILLAR,
      () => {
        for (let index = 0; index < 4; index += 1) {
          expect(screen.getByTestId(`worker-v5-verification-row-status-${index}`)).toHaveTextContent('Chờ')
        }
        expect(screen.queryByTestId('worker-v5-verification-row-4')).toBeNull()
      },
      'four checks, all waiting, and no fifth row invented',
    )
  })

  it('marks a recorded check without marking the others', () => {
    mountChecklist(profileOf({ has_cccd: true }))
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-row-status-0')).toHaveTextContent('Đã ghi')
        expect(screen.getByTestId('worker-v5-verification-row-status-1')).toHaveTextContent('Chờ')
      },
      'a recorded ID card must not imply a recorded portrait',
    )
  })

  it('says plainly that no service is saved rather than showing an empty slot', () => {
    mountChecklist(null)
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-verification-row-meta-2')).toHaveTextContent('Chưa có dịch vụ đã ghi')
      },
      'an empty service list needs words, not a blank',
    )
  })
})
