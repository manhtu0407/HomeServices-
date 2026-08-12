import { inferLocalDealDraftFromKael } from '@nestscout/shared'

import { preAgenticMissingDetails } from '../kael-chat/customer-kael-pre-agentic-copy'

describe('preAgenticMissingDetails', () => {
  it('requires a specific district instead of accepting the generic HCMC area', () => {
    const draft = inferLocalDealDraftFromKael(
      'Tôi cần sửa vòi nước dưới lavabo bị rò nhẹ khi xả. Không khẩn cấp, tôi muốn Kael kiểm tra và báo giá trước.',
    )

    expect(draft.districtLabel).toBe('Khu vực TP.HCM')
    expect(preAgenticMissingDetails(draft)).toContain('quận tại TP.HCM')
  })
})
