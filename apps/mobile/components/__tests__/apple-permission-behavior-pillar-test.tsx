import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Alert, Linking } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  cameraPermissionAllowsAccess,
  classifyPermissionState,
  presentBlockedCameraSettings,
  resolveUserInitiatedCameraPermission,
  shouldOfferCameraSettings,
} from '@/lib/user-initiated-camera-permission'

export const PILLAR = {
  id: 'P39-apple-permission-behavior',
  invariant: 'user-initiated media and route features respect a denial through a shared granted/limited/denied/blocked state machine, and Settings is offered only on an explicit retry after Camera is blocked',
  authority: [
    'Apple App Review Guideline 5.1.1(iv) (permission requests must respect the user decision)',
    'Apple Human Interface Guidelines — Privacy (do not ask people to reconsider a denied permission)',
    'governance/protocols/frontend-test.md G2 (denied and fallback states)',
  ],
  target: 'apps/mobile/lib/user-initiated-camera-permission.ts and production camera, photo-library, location, and microphone permission surfaces',
  layer: 'security-negative',
  siblings: ['P25-customer-kael-chat-mascot', 'P33-worker-jobs-zip-prototype', 'P36-worker-route-unit-protection'],
  mutation: 'request Camera without reading canAskAgain, offer Settings on the first denial, auto-open Settings, or restore an explicit Photo Library request — the permission-state cases turn red',
} as const satisfies PillarManifest

jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}))

const mobileRoot = process.cwd()
const componentsRoot = join(mobileRoot, 'components')

function productionSources(root: string): { path: string; source: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : productionSources(path)
    }
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return []
    return [{ path: relative(mobileRoot, path).replace(/\\/g, '/'), source: readFileSync(path, 'utf8') }]
  })
}

const sources = productionSources(componentsRoot)
const imagePickerSources = sources.filter(({ source }) => source.includes("from 'expo-image-picker'"))
const sourceByPath = new Map(sources.map(({ path, source }) => [path, source]))
const cameraPermissionSource = readFileSync(join(mobileRoot, 'lib/user-initiated-camera-permission.ts'), 'utf8')
const imagePicker = jest.requireMock('expo-image-picker') as {
  getCameraPermissionsAsync: jest.Mock
  requestCameraPermissionsAsync: jest.Mock
}

describe('Apple permission behavior', () => {
  beforeEach(() => {
    imagePicker.getCameraPermissionsAsync.mockReset()
    imagePicker.requestCameraPermissionsAsync.mockReset()
  })

  it('opens the system media picker without an explicit Photo Library permission request', () => {
    const offenders = imagePickerSources
      .filter(({ source }) => source.includes('requestMediaLibraryPermissionsAsync'))
      .map(({ path }) => path)

    withPillarContext(PILLAR, () => expect(offenders).toEqual([]), offenders.join(', '))
  })

  it('does not show custom reconsideration copy after a media or location denial', () => {
    const coercivePermissionCopy = /Cần bật vị trí|Bật vị trí|Bật quyền vị trí|Cần quyền (?:truy cập|camera|kho ảnh|thư viện ảnh|ảnh\/video)|Permission needed|permission is needed|access is needed|Location required|Enable location|Allow (?:Camera|Photos|NestScout)/i
    const offenders = [...sources, { path: 'lib/user-initiated-camera-permission.ts', source: cameraPermissionSource }]
      .filter(({ source }) => coercivePermissionCopy.test(source))
      .map(({ path }) => path)

    withPillarContext(PILLAR, () => expect(offenders).toEqual([]), offenders.join(', '))
  })

  it('routes both Camera actions through the shared permission state machine', () => {
    const cameraRequestSources = imagePickerSources
      .filter(({ source }) => source.includes('requestCameraPermissionsAsync'))
      .map(({ path }) => path)
    const cameraResolverSources = sources
      .filter(({ source }) => source.includes('resolveUserInitiatedCameraPermission'))
      .map(({ path }) => path)
      .sort()

    withPillarContext(PILLAR, () => {
      expect(cameraRequestSources).toEqual([])
      expect(cameraResolverSources).toEqual([
        'components/profile/use-profile-avatar-picker.ts',
        'components/worker/jobs/in-progress-surfaces.tsx',
      ])
      const profileSource = sourceByPath.get('components/profile/use-profile-avatar-picker.ts') ?? ''
      const fieldEvidenceSource = sourceByPath.get('components/worker/jobs/in-progress-surfaces.tsx') ?? ''
      expect(profileSource).toMatch(
        /selectProfileAvatar[\s\S]*source === 'camera'[\s\S]*resolveUserInitiatedCameraPermission/,
      )
      expect(fieldEvidenceSource).toMatch(
        /addFieldEvidence[\s\S]*source === 'camera'[\s\S]*resolveUserInitiatedCameraPermission/,
      )
      for (const source of [profileSource, fieldEvidenceSource]) {
        expect(source).toContain('shouldOfferCameraSettings(permission)')
        expect(source).toContain('presentBlockedCameraSettings(language)')
      }
      expect(cameraPermissionSource).toContain('getCameraPermissionsAsync')
      expect(cameraPermissionSource).toContain('requestCameraPermissionsAsync')
    })
  })

  it('classifies granted, limited, denied, and blocked with canAskAgain intact', () => {
    expect(classifyPermissionState({ accessPrivileges: 'all', canAskAgain: true, granted: true })).toEqual({
      canAskAgain: true,
      state: 'granted',
    })
    expect(classifyPermissionState({ accessPrivileges: 'limited', canAskAgain: true, granted: true })).toEqual({
      canAskAgain: true,
      state: 'limited',
    })
    expect(classifyPermissionState({ canAskAgain: true, granted: false })).toEqual({
      canAskAgain: true,
      state: 'denied',
    })
    expect(classifyPermissionState({ canAskAgain: false, granted: false })).toEqual({
      canAskAgain: false,
      state: 'blocked',
    })
  })

  it('keeps the first denial silent and offers Settings only on a later blocked retry', async () => {
    imagePicker.getCameraPermissionsAsync
      .mockResolvedValueOnce({ canAskAgain: true, granted: false })
      .mockResolvedValueOnce({ canAskAgain: false, granted: false })
    imagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ canAskAgain: false, granted: false })

    const firstAttempt = await resolveUserInitiatedCameraPermission()
    const blockedRetry = await resolveUserInitiatedCameraPermission()

    expect(firstAttempt).toEqual({ canAskAgain: false, requestedThisAttempt: true, state: 'blocked' })
    expect(cameraPermissionAllowsAccess(firstAttempt)).toBe(false)
    expect(shouldOfferCameraSettings(firstAttempt)).toBe(false)
    expect(blockedRetry).toEqual({ canAskAgain: false, requestedThisAttempt: false, state: 'blocked' })
    expect(shouldOfferCameraSettings(blockedRetry)).toBe(true)
    expect(imagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1)
  })

  it('does not open Settings until the user chooses the neutral Settings action', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const settingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    try {
      presentBlockedCameraSettings('vi')

      const buttons = alertSpy.mock.calls[0]?.[2]
      expect(buttons?.map((button) => button.text)).toEqual(['Hủy', 'Mở Cài đặt'])
      expect(settingsSpy).not.toHaveBeenCalled()

      buttons?.[1]?.onPress?.()
      expect(settingsSpy).toHaveBeenCalledTimes(1)
    } finally {
      alertSpy.mockRestore()
      settingsSpy.mockRestore()
    }
  })

  it('retains the microphone denial state and the non-voice transcript fallback', () => {
    const voiceSource = sourceByPath.get('components/customer/kael-chat/on-device-voice-transcript.native.tsx') ?? ''

    withPillarContext(PILLAR, () => {
      expect(voiceSource).toContain('requestMicrophonePermissionsAsync')
      expect(voiceSource).toContain("'Chưa cấp quyền micro.'")
      expect(voiceSource).toContain("buttonLabel={language === 'vi' ? 'Nhập bản chép lời' : 'Enter transcript'}")
    })
  })
})
