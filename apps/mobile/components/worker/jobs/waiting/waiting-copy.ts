import type { WaitingModel, WaitingLanguage } from './waiting.types'
import type { ClockReading } from './waiting-time'
export function waitingCopy(model: WaitingModel, reading: ClockReading, language: WaitingLanguage = 'vi') {
  const vi = language === 'vi', first = model.kind === 'customer-confirmation'
  const base = {
    title: first ? (vi ? 'Đang chờ khách xác nhận' : 'Waiting for confirmation') : (vi ? 'Chờ khách phê duyệt' : 'Waiting for approval'),
    body: first
      ? (vi ? 'Chúng tôi đã gửi thông báo cho khách hàng.\nVui lòng chờ xác nhận trước khi chuyển bước tiếp theo.' : 'Your request has been sent to the customer.\nPlease wait for confirmation before the next step.')
      : model.referenceCopy
        ? (vi ? 'Khách hàng đang kiểm tra kết quả công việc.\nBạn sẽ nhận được thông báo ngay khi có phản hồi.' : 'The customer is reviewing the work.\nYou will be notified when they respond.')
        : (vi ? 'Khách hàng đang xem đề xuất thay đổi.\nChỉ làm phần phát sinh sau khi khách phê duyệt.' : 'The customer is reviewing your scope proposal.\nDo not start extra work until it is approved.'),
    timer: reading.mode === 'remaining' ? (vi ? 'Phút còn lại' : 'Time remaining') : reading.mode === 'elapsed' ? (vi ? 'Thời gian đã chờ' : 'Time elapsed') : (vi ? 'Chưa có mốc thời gian' : 'Time unavailable'),
    action: vi ? 'Xem chi tiết công việc' : 'View job details',
    back: vi ? 'Quay lại' : 'Go back',
  }
  if (model.state === 'unavailable') return { ...base, title: vi ? 'Chưa có yêu cầu đang chờ' : 'No pending request', body: vi ? 'Thông tin sẽ hiển thị khi có dữ liệu từ hệ thống.' : 'Details will appear when available from the system.' }
  if (model.state === 'approved') return { ...base, title: vi ? 'Khách đã xác nhận' : 'Customer confirmed', body: vi ? 'Mở chi tiết để xem trạng thái mới nhất.' : 'Open details to see the latest status.', timer: vi ? 'Đã có phản hồi' : 'Response received' }
  if (model.state === 'rejected') return { ...base, title: vi ? 'Yêu cầu đã kết thúc' : 'Request closed', body: vi ? 'Mở chi tiết để xem phản hồi và hướng xử lý.' : 'Open details for the response and next steps.', timer: vi ? 'Đã có phản hồi' : 'Response received' }
  if (reading.expired) return { ...base, timer: vi ? 'Đang chờ cập nhật' : 'Awaiting update', body: vi ? 'Đã hết thời gian hiển thị.\nQuyết định vẫn cần được hệ thống xác nhận.' : 'The displayed time has expired.\nThe system must still confirm the decision.' }
  return base
}
