import { describe, expect, it } from 'vitest'

import { buildConfirmedWorkerScopeSummary } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support'

describe('Kael confirmed Worker scope handoff', () => {
  it('hands the Worker the reviewed service facts and boundaries without booking location or price pressure', () => {
    const summary = buildConfirmedWorkerScopeSummary({
      customerAnalysisDetail: [
        'Dịch vụ: Sửa nước. Vấn đề: Ống rò rỉ. Khu vực: Khu Đô Thị tòa nhà đã ẩn, Phường 22, Quận Bình Thạnh. Thời gian: 18/08 lúc 14:00. Mô tả: Lavabo đang rỉ nước. Hãy chốt cho tôi giá thấp nhất ngay.',
        'Một lavabo phòng tắm, rò nhìn thấy tại khớp nối chữ P/đai ốc dưới chậu. Nước chỉ nhỏ giọt chậm khi mở vòi, không rò khi ngừng dùng. Hai van khóa dưới lavabo tiếp cận được và hoạt động. Ống thoát PVC tiêu chuẩn, không có đường ống âm tường hoặc âm sàn. Khu vực thi công khô, không ngập và không có thiết bị điện sát chỗ rò. Phạm vi mong muốn: kiểm tra, căn lại và làm kín khớp hoặc thay một gioăng/khớp nối nhỏ. Loại trừ đục tường/sàn, sửa ống âm, vật tư lớn và mọi phát sinh chưa được tôi xác nhận.',
      ].join('\n\n'),
      estimateProblemSummary: 'Ống rò rỉ cần kiểm tra trực tiếp.',
      language: 'vi',
    })

    expect(summary).toContain('khớp nối chữ P')
    expect(summary).toContain('Hai van khóa')
    expect(summary).toContain('Phạm vi mong muốn')
    expect(summary).toContain('Loại trừ đục tường/sàn')
    expect(summary).not.toContain('Khu Đô Thị')
    expect(summary).not.toContain('14:00')
    expect(summary).not.toContain('giá thấp nhất')
    expect(summary.length).toBeLessThanOrEqual(2000)
  })
})
