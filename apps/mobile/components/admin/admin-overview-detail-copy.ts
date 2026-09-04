import type { AppLanguage } from '@/lib/app-language'

export function getAdminOverviewDetailCopy(language: AppLanguage) {
  return language === 'vi' ? {
    close: 'Đóng', currentData: 'Dữ liệu hiện tại', detail: 'Chi tiết', empty: 'Hiện không có bản ghi nào trong nhóm này.',
    generatedAt: 'Tạo lúc', loading: 'Đang tải chi tiết…', notRecorded: 'Chưa ghi nhận', oldestUpdate: 'Cập nhật lâu nhất',
    permissionLimited: 'Tài khoản của bạn chỉ được xem số tổng quan cho nhóm này.', recentRecords: '5 bản ghi cập nhật lâu nhất',
    retry: 'Thử lại', serviceBreakdown: 'Theo nhóm dịch vụ', statusBreakdown: 'Theo trạng thái', total: 'Tổng số hiện tại', viewAll: 'Xem tất cả',
  } : {
    close: 'Close', currentData: 'Current data', detail: 'Details', empty: 'There are currently no records in this group.',
    generatedAt: 'Generated', loading: 'Loading details…', notRecorded: 'Not recorded', oldestUpdate: 'Oldest update',
    permissionLimited: 'Your account can only view the summary count for this group.', recentRecords: '5 oldest updated records',
    retry: 'Try again', serviceBreakdown: 'By service', statusBreakdown: 'By status', total: 'Current total', viewAll: 'View all',
  }
}
