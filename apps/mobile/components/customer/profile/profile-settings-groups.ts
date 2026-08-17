import type { AppLanguage } from '@/lib/app-language'

import { customerV21Assets } from '../ui/assets'
import type { ProfileSettingsGroupModel } from './profile-stateful-surfaces'

type ProfileSettingsActions = {
  deleteAccount: () => void
  openAddress: () => void
  openAppearance: () => void
  openLanguage: () => void
  openLegal: () => void
  openMemory: () => void
  openNotifications: () => void
  openPassword: () => void
  openPersonalDetails: () => void
  openRefunds: () => void
  openSupport: () => void
  signOut: () => void
}

type BuildProfileSettingsGroupsInput = {
  actions: ProfileSettingsActions
  addressStatus: string
  bankOptionLabel: string
  language: AppLanguage
  memoryAllowed: boolean | null
  notificationUnreadCount: number
  themeMode: 'dark' | 'light'
}

export function buildCustomerProfileSettingsGroups({
  actions,
  addressStatus,
  bankOptionLabel,
  language,
  memoryAllowed,
  notificationUnreadCount,
  themeMode,
}: BuildProfileSettingsGroupsInput): ProfileSettingsGroupModel[] {
  const vi = language === 'vi'

  return [
    {
      id: 'account-security',
      title: vi ? 'Tài khoản & bảo mật' : 'Account & security',
      rows: [
        {
          glyph: 'personal',
          image: customerV21Assets.identity,
          onPress: actions.openPersonalDetails,
          status: vi ? 'Sửa' : 'Edit',
          subtitle: vi ? 'Tên, số điện thoại và email' : 'Name, phone, and email',
          testID: 'customer-v21-profile-setting-personal',
          title: vi ? 'Thông tin cá nhân' : 'Personal details',
        },
        {
          glyph: 'address',
          image: customerV21Assets.address,
          onPress: actions.openAddress,
          status: addressStatus,
          subtitle: vi ? 'Địa chỉ mặc định và địa chỉ phụ' : 'Default and secondary addresses',
          testID: 'customer-v21-profile-setting-address',
          title: vi ? 'Địa chỉ' : 'Addresses',
        },
        {
          glyph: 'password',
          image: customerV21Assets.password,
          onPress: actions.openPassword,
          status: vi ? 'Đổi' : 'Change',
          subtitle: vi ? 'Cập nhật mật khẩu đăng nhập' : 'Update your login password',
          testID: 'customer-v21-profile-setting-password',
          title: vi ? 'Bảo mật đăng nhập' : 'Login security',
        },
      ],
    },
    {
      id: 'payment-refunds',
      title: vi ? 'Thanh toán & hoàn tiền' : 'Payments & refunds',
      rows: [
        {
          glyph: 'refunds',
          image: customerV21Assets.payment,
          onPress: actions.openRefunds,
          status: bankOptionLabel,
          subtitle: vi ? 'Tài khoản nhận hoàn tiền đã xác nhận' : 'Account for confirmed refunds',
          testID: 'customer-v21-profile-setting-refunds',
          title: vi ? 'Hoàn tiền' : 'Refunds',
        },
      ],
    },
    {
      id: 'app',
      title: vi ? 'Ứng dụng' : 'App',
      rows: [
        {
          glyph: 'language',
          image: customerV21Assets.language,
          onPress: actions.openLanguage,
          status: vi ? 'Tiếng Việt' : 'English',
          subtitle: vi ? 'Ngôn ngữ hiển thị' : 'Display language',
          testID: 'customer-v21-profile-setting-language',
          title: vi ? 'Ngôn ngữ' : 'Language',
        },
        {
          glyph: 'appearance',
          image: customerV21Assets.theme,
          onPress: actions.openAppearance,
          status: themeMode === 'dark'
            ? (vi ? 'Tối' : 'Dark')
            : (vi ? 'Sáng' : 'Light'),
          subtitle: vi ? 'Chế độ sáng hoặc tối' : 'Light or dark mode',
          testID: 'customer-v21-profile-setting-appearance',
          title: vi ? 'Giao diện' : 'Appearance',
        },
        {
          glyph: 'notifications',
          image: customerV21Assets.notification,
          onPress: actions.openNotifications,
          status: notificationUnreadCount > 0
            ? (vi ? `${notificationUnreadCount} chưa đọc` : `${notificationUnreadCount} unread`)
            : undefined,
          subtitle: vi ? 'Cập nhật về công việc và tài khoản' : 'Job and account updates',
          testID: 'customer-v21-profile-setting-notifications',
          title: vi ? 'Thông báo' : 'Notifications',
        },
      ],
    },
    {
      id: 'privacy-support',
      title: vi ? 'Quyền riêng tư & hỗ trợ' : 'Privacy & support',
      rows: [
        {
          glyph: 'memory',
          image: customerV21Assets.memory,
          onPress: actions.openMemory,
          status: memoryAllowed === true
            ? (vi ? 'Cho phép' : 'Allowed')
            : memoryAllowed === false
              ? (vi ? 'Không cho phép' : 'Not allowed')
              : (vi ? 'Chưa chọn' : 'Not set'),
          subtitle: vi ? 'Bạn quyết định Kael được ghi nhớ gì' : 'Choose what Kael may remember',
          testID: 'customer-v21-profile-setting-memory',
          title: vi ? 'Bộ nhớ Kael' : 'Kael memory',
        },
        {
          glyph: 'support',
          image: customerV21Assets.feedback,
          onPress: actions.openSupport,
          subtitle: vi ? 'Trợ giúp về công việc, giao dịch và tài khoản' : 'Help with jobs, transactions, and your account',
          testID: 'customer-v21-profile-setting-support',
          title: vi ? 'Trợ giúp & hỗ trợ' : 'Help & support',
        },
        {
          glyph: 'terms',
          image: customerV21Assets.privacy,
          onPress: actions.openLegal,
          subtitle: vi ? 'Quyền, trách nhiệm và quyền riêng tư' : 'Rights, responsibilities, and privacy',
          testID: 'customer-v21-profile-setting-legal',
          title: vi ? 'Điều khoản & Chính sách' : 'Terms & Policies',
        },
      ],
    },
    {
      id: 'account-management',
      title: vi ? 'Quản lý tài khoản' : 'Account management',
      rows: [
        {
          glyph: 'signout',
          image: customerV21Assets.signOut,
          onPress: actions.signOut,
          testID: 'customer-v21-profile-setting-signout',
          title: vi ? 'Đăng xuất' : 'Sign out',
        },
        {
          destructive: true,
          glyph: 'delete',
          image: customerV21Assets.deleteAccount,
          onPress: actions.deleteAccount,
          subtitle: vi ? 'Xóa quyền truy cập và thông tin cá nhân' : 'Remove access and personal information',
          testID: 'customer-v21-profile-setting-delete-account',
          title: vi ? 'Xóa tài khoản' : 'Delete account',
        },
      ],
    },
  ]
}
