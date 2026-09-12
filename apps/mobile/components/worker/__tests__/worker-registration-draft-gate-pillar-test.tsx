import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { WorkerProfileResponse } from '@/lib/api-types'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { uploadWorkerVerificationDrafts } from '@/lib/media-upload'
import { WorkerV5WorkerRegistrationBody } from '../profile/registration-surfaces'

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
}))
jest.mock('@/lib/media-upload', () => ({ uploadWorkerVerificationDrafts: jest.fn() }))

export const PILLAR = {
  id: 'P163-worker-registration-draft-gate',
  invariant: 'KYC submission waits for durable document draft acknowledgement; a refused save keeps the form retryable without claiming submission',
  authority: ['governance/RULES.md #8', 'governance/structures/worker-workflow.md B0'],
  target: 'apps/mobile/components/worker/profile/registration-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P07-worker-verification-states'],
  mutation: 'ignore the document draft-save false result; the refusal case calls workerSubmitRegistration and fails',
} as const satisfies PillarManifest

const urls = {
  cccd_front_url: 'supabase://worker-verification/fixture/cccd-front/front.jpg',
  cccd_back_url: 'supabase://worker-verification/fixture/cccd-back/back.jpg',
  selfie_url: 'supabase://worker-verification/fixture/selfie/selfie.jpg',
}
const profile: WorkerProfileResponse = {
  id: 'fixture', verification_status: 'draft', legal_name: 'Thợ kiểm thử',
  date_of_birth: '1990-01-01', districts: ['Quận 1'], problem_specializations: [],
  service_types: ['electrical'], service_radius_km: 8, years_experience: 2,
  bank_name: 'Ngân hàng kiểm thử',
  avatar_url: null, active_minutes: 0, last_active_at: null,
  is_available: false, is_approved: false, is_suspended: false,
  home_lat: null, home_lng: null, gender: null, bank_account_masked: null,
  rating: 0, total_jobs: 0, has_cccd: false, has_selfie: false,
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(uploadWorkerVerificationDrafts).mockResolvedValue({ success: true, urls })
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///fixture.jpg', fileName: 'fixture.jpg', width: 100, height: 100 }],
  })
  jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

it.each(['vi', 'en'] as const)('resumes the server draft without requesting stored bank details or uploading documents again (%s)', async (language) => {
  const workerSubmitRegistration = jest.fn(async () => true)
  const workerSaveRegistrationDraft = jest.fn(async () => true)
  const runtime = { actions: { workerSubmitRegistration, workerSaveRegistrationDraft } } as unknown as ReturnType<typeof useFrontendWorkflow>
  render(<WorkerV5WorkerRegistrationBody language={language} profile={{ ...profile, has_cccd: true, has_selfie: true, bank_account_masked: '***6789', years_experience: 0 }} reduceTransparency runtime={runtime} />)
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(uploadWorkerVerificationDrafts).not.toHaveBeenCalled()
  expect(workerSubmitRegistration).toHaveBeenCalledWith(expect.objectContaining({ years_experience: 0 }))
  const submitted = workerSubmitRegistration.mock.calls[0] as unknown as [Record<string, unknown>]
  expect(submitted[0]).not.toHaveProperty('bank_account')
  expect(submitted[0]).not.toHaveProperty('cccd_front_url')
})

it.each(['vi', 'en'] as const)('checks an unresolved command without uploading or submitting a new form (%s)', async (language) => {
  const workerReconcileRegistration = jest.fn(async () => false)
  const workerSubmitRegistration = jest.fn(async () => true)
  const runtime = { workerRegistrationRecovery: { phase: 'unknown', receipt: null }, actions: {
    workerReconcileRegistration, workerSubmitRegistration, workerSaveRegistrationDraft: jest.fn(async () => true),
  } } as unknown as ReturnType<typeof useFrontendWorkflow>
  render(<WorkerV5WorkerRegistrationBody language={language} profile={profile} reduceTransparency runtime={runtime} />)
  expect(screen.getByTestId('worker-v5-registration-recovery-status')).toHaveProp('accessibilityLiveRegion', 'polite')
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerReconcileRegistration).toHaveBeenCalledTimes(1)
  expect(workerSubmitRegistration).not.toHaveBeenCalled()
  expect(uploadWorkerVerificationDrafts).not.toHaveBeenCalled()
  expect(Alert.alert).not.toHaveBeenCalled()
})

it.each(['vi', 'en'] as const)('does not claim a sent submission when the local journal is unavailable (%s)', async (language) => {
  const workerReconcileRegistration = jest.fn(async () => false)
  const workerSubmitRegistration = jest.fn(async () => true)
  const runtime = { workerRegistrationRecovery: { phase: 'storage_error', receipt: null }, actions: {
    workerReconcileRegistration, workerSubmitRegistration, workerSaveRegistrationDraft: jest.fn(async () => true),
  } } as unknown as ReturnType<typeof useFrontendWorkflow>
  render(<WorkerV5WorkerRegistrationBody language={language} profile={profile} reduceTransparency runtime={runtime} />)
  expect(screen.getByTestId('worker-v5-registration-recovery-status')).toHaveTextContent(language === 'vi'
    ? 'Không đọc hoặc lưu được trạng thái gửi hồ sơ trên thiết bị. Chưa thể xác nhận kết quả. Kiểm tra lại; nếu lỗi còn lặp lại, liên hệ hỗ trợ.'
    : 'The submission state could not be read or saved on this device. The outcome is not confirmed. Check again; if the issue persists, contact support.')
  expect(screen.getByTestId('worker-v5-registration-legal-name')).toHaveProp('editable', false)
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerReconcileRegistration).toHaveBeenCalledTimes(1)
  expect(workerSubmitRegistration).not.toHaveBeenCalled()
  expect(uploadWorkerVerificationDrafts).not.toHaveBeenCalled()
  expect(Alert.alert).not.toHaveBeenCalled()
})

it('preserves a service-only edit when the server profile refreshes before autosave', async () => {
  const workerSaveRegistrationDraft = jest.fn(async () => true)
  const runtime = { actions: { workerSaveRegistrationDraft, workerSubmitRegistration: jest.fn(async () => true) } } as unknown as ReturnType<typeof useFrontendWorkflow>
  const view = render(<WorkerV5WorkerRegistrationBody language="vi" profile={profile} reduceTransparency runtime={runtime} />)
  fireEvent.press(screen.getByTestId('worker-v5-registration-service-plumbing'))
  expect(screen.getByTestId('worker-v5-registration-service-plumbing')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }))
  view.rerender(<WorkerV5WorkerRegistrationBody language="vi" profile={{ ...profile }} reduceTransparency runtime={runtime} />)
  expect(screen.getByTestId('worker-v5-registration-service-plumbing')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }))
  await act(async () => { jest.advanceTimersByTime(700) })
  expect(workerSaveRegistrationDraft).toHaveBeenCalledWith(expect.objectContaining({ service_types: ['electrical', 'plumbing'] }))
})

it.each(['vi', 'en'] as const)('keeps a refused draft editable without claiming a new review request was sent (%s)', async (language) => {
  const workerSubmitRegistration = jest.fn(async () => true)
  const runtime = { workerRegistrationRecovery: { phase: 'draft_error', receipt: null }, actions: {
    workerSubmitRegistration, workerSaveRegistrationDraft: jest.fn(async () => true),
  } } as unknown as ReturnType<typeof useFrontendWorkflow>
  render(<WorkerV5WorkerRegistrationBody language={language} profile={{ ...profile, has_cccd: true, has_selfie: true, bank_account_masked: '***6789' }} reduceTransparency runtime={runtime} />)
  expect(screen.getByTestId('worker-v5-registration-recovery-status')).toHaveTextContent(language === 'vi'
    ? 'Chưa xác nhận được việc lưu hồ sơ; chưa gửi yêu cầu xét duyệt mới. Kiểm tra kết nối rồi thử lại.'
    : 'Profile saving is not confirmed; no new review request was sent. Check your connection and try again.')
  expect(screen.getByTestId('worker-v5-registration-legal-name')).toHaveProp('editable', true)
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerSubmitRegistration).toHaveBeenCalledTimes(1)
  expect(uploadWorkerVerificationDrafts).not.toHaveBeenCalled()
})

it.each(['vi', 'en'] as const)('resumes a partially saved identity document by uploading only its missing back (%s)', async (language) => {
  const workerSubmitRegistration = jest.fn(async () => true)
  const workerSaveRegistrationDraft = jest.fn(async () => true)
  const runtime = { actions: { workerSubmitRegistration, workerSaveRegistrationDraft } } as unknown as ReturnType<typeof useFrontendWorkflow>
  const partialProfile = { ...profile, has_cccd_front: true, has_cccd_back: false, has_selfie: true, bank_account_masked: '***6789' }
  jest.mocked(uploadWorkerVerificationDrafts).mockResolvedValue({ success: true, urls: { cccd_back_url: urls.cccd_back_url } })
  render(<WorkerV5WorkerRegistrationBody language={language} profile={partialProfile} reduceTransparency runtime={runtime} />)
  expect(screen.getByTestId('worker-v5-registration-cccd-front')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }))
  expect(screen.getByTestId('worker-v5-registration-cccd-back')).toHaveProp('accessibilityState', expect.objectContaining({ selected: false }))
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-cccd-back')) })
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  withPillarContext(PILLAR, () => {
    expect(uploadWorkerVerificationDrafts).toHaveBeenCalledTimes(1)
    expect(uploadWorkerVerificationDrafts).toHaveBeenCalledWith({ cccdBack: expect.objectContaining({ uri: 'file:///fixture.jpg' }) }, profile.id)
    expect(workerSaveRegistrationDraft).toHaveBeenCalledWith({ cccd_back_url: urls.cccd_back_url })
    expect(workerSubmitRegistration).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('worker-v5-registration-error')).toBeNull()
  }, 'a server draft with front and selfie must not require selecting those private images again')
})

it('reuploads a changed selection without reuploading the unchanged document from a refused draft', async () => {
  const workerSubmitRegistration = jest.fn(async () => true)
  const workerSaveRegistrationDraft = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
  const runtime = { actions: { workerSubmitRegistration, workerSaveRegistrationDraft } } as unknown as ReturnType<typeof useFrontendWorkflow>
  jest.mocked(uploadWorkerVerificationDrafts)
    .mockResolvedValueOnce({ success: true, urls: { cccd_front_url: urls.cccd_front_url, cccd_back_url: urls.cccd_back_url } })
    .mockResolvedValueOnce({ success: true, urls: { cccd_back_url: `${urls.cccd_back_url}-replacement` } })
  render(<WorkerV5WorkerRegistrationBody language="vi" profile={{ ...profile, has_cccd: true, has_selfie: true, bank_account_masked: '***6789' }} reduceTransparency runtime={runtime} />)
  for (const slot of ['cccd-front', 'cccd-back']) {
    await act(async () => { fireEvent.press(screen.getByTestId(`worker-v5-registration-${slot}`)) })
  }
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerSubmitRegistration).not.toHaveBeenCalled()
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///replacement.jpg', width: 100, height: 100 }] })
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-cccd-back')) })
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(uploadWorkerVerificationDrafts).toHaveBeenNthCalledWith(2, { cccdBack: expect.objectContaining({ uri: 'file:///replacement.jpg' }) }, profile.id)
  expect(workerSubmitRegistration).toHaveBeenCalledWith(expect.objectContaining({
    cccd_front_url: urls.cccd_front_url, cccd_back_url: `${urls.cccd_back_url}-replacement`,
  }))
})

it('keeps a missing document blocked when a newer profile explicitly contradicts the legacy combined flag', async () => {
  const workerSubmitRegistration = jest.fn(async () => true)
  const runtime = { actions: { workerSubmitRegistration, workerSaveRegistrationDraft: jest.fn(async () => true) } } as unknown as ReturnType<typeof useFrontendWorkflow>
  render(<WorkerV5WorkerRegistrationBody language="vi" profile={{ ...profile, has_cccd: true, has_cccd_front: true, has_cccd_back: false, has_selfie: true, bank_account_masked: '***6789' }} reduceTransparency runtime={runtime} />)
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerSubmitRegistration).not.toHaveBeenCalled()
  expect(uploadWorkerVerificationDrafts).not.toHaveBeenCalled()
  expect(screen.getByTestId('worker-v5-registration-error')).toHaveTextContent('Cần đủ ảnh mặt trước, mặt sau giấy tờ và ảnh chân dung.')
})

it.each(['vi', 'en'] as const)('keeps submission blocked when the document draft was not acknowledged (%s)', async (language) => {
  let resolveSave!: (saved: boolean) => void
  const workerSaveRegistrationDraft = jest.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
  const workerSubmitRegistration = jest.fn(async () => true)
  const runtime = { actions: { workerSaveRegistrationDraft, workerSubmitRegistration } } as unknown as ReturnType<typeof useFrontendWorkflow>
  render(<WorkerV5WorkerRegistrationBody language={language} profile={profile} reduceTransparency runtime={runtime} />)
  fireEvent.changeText(screen.getByTestId('worker-v5-registration-bank-account'), '123456789')
  for (const slot of ['cccd-front', 'cccd-back', 'selfie']) {
    await act(async () => { fireEvent.press(screen.getByTestId(`worker-v5-registration-${slot}`)) })
  }
  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerSaveRegistrationDraft).toHaveBeenCalledWith(urls)
  expect(workerSubmitRegistration).not.toHaveBeenCalled()
  await act(async () => { resolveSave(false) })
  withPillarContext(PILLAR, () => {
    expect(workerSubmitRegistration).not.toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(screen.getByTestId('worker-v5-registration-error')).toHaveTextContent(language === 'vi'
      ? 'Chưa xác nhận được việc lưu giấy tờ. Hãy kiểm tra kết nối rồi thử lại.'
      : 'Document saving could not be confirmed. Check the connection and try again.')
    expect(screen.getByTestId('worker-v5-registration-submit')).toBeEnabled()
    expect(screen.getByTestId('worker-v5-registration-bank-account')).toHaveProp('value', '123456789')
  }, 'draft save refused after successful upload')

  await act(async () => { fireEvent.press(screen.getByTestId('worker-v5-registration-submit')) })
  expect(workerSubmitRegistration).not.toHaveBeenCalled()
  expect(uploadWorkerVerificationDrafts).toHaveBeenCalledTimes(1)
  await act(async () => { resolveSave(true) })
  withPillarContext(PILLAR, () => {
    expect(workerSubmitRegistration).toHaveBeenCalledTimes(1)
    expect(workerSubmitRegistration).toHaveBeenCalledWith(expect.objectContaining(urls))
    expect(screen.queryByTestId('worker-v5-registration-error')).toBeNull()
    expect(Alert.alert).toHaveBeenCalledWith(
      language === 'vi' ? 'Đã gửi hồ sơ' : 'Profile submitted',
      expect.any(String),
    )
  }, 'explicit retry submits only after document acknowledgement')
})
