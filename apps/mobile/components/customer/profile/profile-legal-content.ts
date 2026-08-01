import type { AppLanguage } from '@/lib/app-language'

export type CustomerProfileLegalSection = {
  bullets?: readonly string[]
  id: 'terms' | 'privacy' | 'cancellation' | 'support' | 'changes'
  paragraphs: readonly string[]
  summary: string
  title: string
}

type CustomerProfileLegalCopy = {
  detailAction: string
  detailTitle: string
  heroBody: string
  heroTitle: string
  importantAction: string
  importantBullets: readonly string[]
  importantTitle: string
  sections: readonly CustomerProfileLegalSection[]
}

const vi: CustomerProfileLegalCopy = {
  detailAction: 'Chạm để mở',
  detailTitle: 'Nội dung chi tiết',
  heroBody: 'Quyền, trách nhiệm và cách NestScout bảo vệ thông tin của bạn.',
  heroTitle: 'Hiểu rõ trước khi sử dụng',
  importantAction: 'Tóm tắt',
  importantBullets: [
    'Bạn luôn là người xác nhận việc đặt dịch vụ, chọn thợ, thay đổi công việc, xác nhận hoàn tất và thanh toán.',
    'Kael hỗ trợ làm rõ nhu cầu và chuẩn bị ước tính; Kael không tự quyết định hoặc xác nhận thay bạn.',
    'Địa chỉ chi tiết chỉ được chia sẻ với thợ phù hợp sau khi các bước xác nhận cần thiết đã hoàn tất.',
    'Bạn có quyền xem, sửa và yêu cầu xử lý thông tin cá nhân theo quy định.',
  ],
  importantTitle: 'Những điều quan trọng',
  sections: [
    {
      bullets: [
        'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.',
        'Nếu có thay đổi ảnh hưởng đến nội dung công việc hoặc chi phí, thay đổi đó phải được hiển thị để bạn xác nhận trước khi tiếp tục.',
        'Bạn chỉ nên xác nhận hoàn tất sau khi đã kiểm tra kết quả và các bằng chứng liên quan.',
        'Các phương thức thanh toán, khoản phí và điều kiện đang áp dụng phải được hiển thị rõ trước khi bạn xác nhận.',
      ],
      id: 'terms',
      paragraphs: [
        'NestScout giúp bạn mô tả nhu cầu, nhận mức giá ước tính, tìm thợ phù hợp, theo dõi công việc và lưu lại các xác nhận quan trọng trong ứng dụng.',
        'Kael có thể giúp làm rõ nhu cầu, chuẩn bị phạm vi công việc và đưa ra mức giá ước tính. Kael không tự quyết định hoặc xác nhận thay bạn.',
        'Bạn cần cung cấp thông tin chính xác, bảo vệ thông tin đăng nhập và thông báo cho NestScout nếu phát hiện tài khoản bị sử dụng trái phép.',
        'Không được sử dụng ứng dụng để lừa đảo, quấy rối, yêu cầu công việc trái pháp luật, làm sai lệch bằng chứng hoặc chia sẻ thông tin của người khác khi chưa được phép.',
        'Thợ chịu trách nhiệm thực hiện công việc theo phạm vi đã được xác nhận. NestScout chịu trách nhiệm đối với những phần dịch vụ do NestScout trực tiếp cung cấp theo quy định.',
      ],
      summary: 'Cách sử dụng NestScout, quyền xác nhận và trách nhiệm của các bên.',
      title: 'Điều khoản sử dụng',
    },
    {
      bullets: [
        'Thông tin tài khoản và liên hệ.',
        'Địa chỉ và khu vực cần cung cấp dịch vụ.',
        'Nội dung yêu cầu, thời gian, phạm vi công việc và bằng chứng bạn chủ động cung cấp.',
        'Trao đổi với thợ, bộ phận hỗ trợ, thông tin giao dịch và hoàn tiền.',
        'Thông tin cần thiết để bảo vệ tài khoản và vận hành ứng dụng.',
      ],
      id: 'privacy',
      paragraphs: [
        'NestScout chỉ sử dụng thông tin để vận hành tài khoản, cung cấp dịch vụ, tìm thợ phù hợp, chuẩn bị mức giá ước tính, hỗ trợ giao dịch, xử lý phản ánh và bảo vệ người dùng.',
        'Kael chỉ ghi nhớ các tương tác khi bạn cho phép. Bạn có thể thay đổi quyền này trong phần Bộ nhớ Kael.',
        'Thợ chỉ nhận những thông tin cần thiết để thực hiện công việc. Địa chỉ chi tiết chỉ được chia sẻ sau khi các bước xác nhận cần thiết đã hoàn tất.',
        'Một số đơn vị hỗ trợ thanh toán, bản đồ, thông báo hoặc vận hành dịch vụ có thể nhận phần thông tin tối thiểu cần thiết để hoàn thành nhiệm vụ.',
        'NestScout không mua bán thông tin cá nhân.',
        'Bạn có quyền biết thông tin của mình đang được sử dụng như thế nào; xem hoặc sửa thông tin; rút lại sự đồng ý; yêu cầu cung cấp, xóa hoặc hạn chế sử dụng; phản đối việc sử dụng không phù hợp; gửi khiếu nại và yêu cầu hỗ trợ.',
        'Một số thông tin có thể cần được giữ lại trong thời gian nhất định để hoàn thành giao dịch, giải quyết tranh chấp hoặc thực hiện nghĩa vụ theo quy định.',
        'Khi bạn sử dụng giọng nói, nội dung đã chuyển thành chữ sẽ được hiển thị để bạn kiểm tra và chỉnh sửa. Bản ghi âm gốc không được gửi đi.',
      ],
      summary: 'Thông tin được sử dụng, mục đích sử dụng và quyền kiểm soát của bạn.',
      title: 'Quyền riêng tư',
    },
    {
      id: 'cancellation',
      paragraphs: [
        'Điều kiện hủy và khoản phí phát sinh, nếu có, phải được hiển thị trước khi bạn xác nhận hủy.',
        'Việc hoàn tiền chỉ được thực hiện khi giao dịch đáp ứng điều kiện áp dụng. Phương thức và tiến trình hoàn tiền sẽ được hiển thị theo trạng thái thực tế của giao dịch.',
        'NestScout không tự đưa ra một thời hạn hoàn tiền cố định nếu thời hạn đó chưa được xác nhận trong ứng dụng.',
      ],
      summary: 'Điều kiện phải được hiển thị rõ trước khi bạn xác nhận.',
      title: 'Hủy dịch vụ và hoàn tiền',
    },
    {
      id: 'support',
      paragraphs: [
        'Khi gặp vấn đề, bạn có thể gửi phản ánh trong ứng dụng. NestScout sẽ dựa trên phạm vi công việc đã xác nhận, nội dung trao đổi, bằng chứng hoàn tất và thông tin giao dịch để xem xét.',
        'Bạn nên giữ trao đổi và các thay đổi quan trọng trong ứng dụng để có căn cứ đối chiếu khi cần.',
        'Nếu không đồng ý với kết quả giải quyết, bạn có quyền yêu cầu xem xét lại hoặc sử dụng các quyền khác theo quy định.',
      ],
      summary: 'Cách gửi phản ánh, đối chiếu bằng chứng và yêu cầu xem xét lại.',
      title: 'Phản ánh và giải quyết vấn đề',
    },
    {
      id: 'changes',
      paragraphs: [
        'NestScout có thể cập nhật nội dung này khi dịch vụ hoặc quy định có liên quan thay đổi.',
        'Nếu thay đổi ảnh hưởng đáng kể đến quyền của bạn, NestScout sẽ thông báo trước khi nội dung mới được áp dụng.',
        'Việc mở trang này để đọc không đồng nghĩa bạn đã đồng ý cho mọi mục đích sử dụng thông tin. Các quyền tùy chọn sẽ được hỏi riêng tại chức năng liên quan.',
      ],
      summary: 'Cách nội dung mới được thông báo và áp dụng.',
      title: 'Thay đổi chính sách',
    },
  ],
}

const en: CustomerProfileLegalCopy = {
  detailAction: 'Tap to open',
  detailTitle: 'Detailed information',
  heroBody: 'Your rights, responsibilities, and how NestScout protects your information.',
  heroTitle: 'Know before you use',
  importantAction: 'Summary',
  importantBullets: [
    'You always confirm booking, worker selection, work changes, completion, and payment.',
    'Kael helps clarify the request and prepare an estimate; Kael does not decide or confirm on your behalf.',
    'The full address is shared with the appropriate worker only after the required confirmations are complete.',
    'You may access, correct, and request action on your personal information as permitted by law.',
  ],
  importantTitle: 'Important points',
  sections: [
    {
      bullets: [
        'This is an estimate prepared by Kael from the available information. Kael may update it when new scope evidence is available.',
        'A change that affects the work or cost must be shown for your confirmation before work continues.',
        'Confirm completion only after reviewing the result and related evidence.',
        'Available payment methods, fees, and conditions must be shown clearly before you confirm.',
      ],
      id: 'terms',
      paragraphs: [
        'NestScout helps you describe a request, receive an estimate, find a suitable worker, follow the job, and keep important confirmations in the app.',
        'Kael can help clarify your needs, prepare the work scope, and provide an estimate. Kael does not decide or confirm on your behalf.',
        'You must provide accurate information, protect your sign-in details, and notify NestScout if you notice unauthorized account use.',
        'Do not use the app for fraud, harassment, unlawful requests, false evidence, or sharing another person’s information without permission.',
        'The worker is responsible for completing the confirmed scope. NestScout is responsible for the parts of the service that it directly provides as required by law.',
      ],
      summary: 'How to use NestScout, your confirmation rights, and each party’s responsibilities.',
      title: 'Terms of use',
    },
    {
      bullets: [
        'Account and contact information.',
        'The address and area where service is needed.',
        'Your request, schedule, work scope, and evidence you choose to provide.',
        'Messages with workers and support, transaction information, and refunds.',
        'Information needed to protect your account and operate the app.',
      ],
      id: 'privacy',
      paragraphs: [
        'NestScout uses information only to operate your account, provide services, find a suitable worker, prepare estimates, support transactions, handle concerns, and protect users.',
        'Kael remembers interactions only when you allow it. You can change this permission in Kael memory.',
        'Workers receive only the information needed for the job. The full address is shared only after the required confirmations are complete.',
        'Providers that support payments, maps, notifications, or service operations may receive the minimum information needed to perform their task.',
        'NestScout does not sell personal information.',
        'You may learn how your information is used; access or correct it; withdraw consent; request access, deletion, or restriction; object to inappropriate use; submit a complaint; and request support.',
        'Some information may need to be retained for a limited period to complete a transaction, resolve a dispute, or meet legal obligations.',
        'When you use voice input, the transcript is shown for your review and editing. The original audio is not uploaded.',
      ],
      summary: 'Information used, why it is used, and the controls available to you.',
      title: 'Privacy',
    },
    {
      id: 'cancellation',
      paragraphs: [
        'Cancellation conditions and any applicable charge must be shown before you confirm a cancellation.',
        'A refund is made only when the transaction meets the applicable conditions. Its method and progress follow the real transaction state shown in the app.',
        'NestScout does not promise a fixed refund time unless that time has been confirmed in the app.',
      ],
      summary: 'Conditions must be clear before you confirm.',
      title: 'Cancellation and refunds',
    },
    {
      id: 'support',
      paragraphs: [
        'If a problem occurs, you can submit a concern in the app. NestScout reviews the confirmed scope, messages, completion evidence, and transaction information.',
        'Keep important messages and changes in the app so they can be reviewed if needed.',
        'If you disagree with the outcome, you may request another review or exercise other rights available under the law.',
      ],
      summary: 'How to raise a concern, review evidence, and request another review.',
      title: 'Concerns and resolution',
    },
    {
      id: 'changes',
      paragraphs: [
        'NestScout may update this information when the service or relevant requirements change.',
        'If a change materially affects your rights, NestScout will notify you before the new content applies.',
        'Opening this page to read it does not mean that you consent to every use of your information. Optional permissions are requested separately in the relevant feature.',
      ],
      summary: 'How updated content is communicated and applied.',
      title: 'Policy changes',
    },
  ],
}

export function customerProfileLegalCopy(language: AppLanguage) {
  return language === 'vi' ? vi : en
}
