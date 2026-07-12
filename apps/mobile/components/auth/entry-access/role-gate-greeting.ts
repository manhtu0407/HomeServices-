export type RoleGateGreeting = Readonly<{
  headline: string
  lead: string
  signature: string
}>

type RoleGateGreetingPeriod = 'morning' | 'midday' | 'afternoon' | 'evening'

export const roleGateGreetingVariants: Readonly<Record<RoleGateGreetingPeriod, readonly RoleGateGreeting[]>> = {
  morning: [
    {
      headline: 'Chào buổi sáng, mình bắt đầu thật nhẹ nhàng nhé.',
      lead: 'Bạn đến để tìm người hỗ trợ, hay để nhận một việc phù hợp?',
      signature: 'Mọi việc nhỏ đều có thể bắt đầu từ đây.',
    },
    {
      headline: 'Buổi sáng yên, mình cùng sắp xếp một việc nhỏ nhé.',
      lead: 'Mình chọn vai trò phù hợp để bắt đầu thật rõ ràng.',
      signature: 'Một khởi đầu gọn gàng cho việc đang chờ.',
    },
    {
      headline: 'Chào ngày mới, Kael ở đây để việc nhà bớt nặng.',
      lead: 'Bạn muốn tìm người hỗ trợ, hay mang tay nghề của mình đến nơi cần?',
      signature: 'Đúng người cho một ngày nhẹ hơn.',
    },
    {
      headline: 'Sáng nay, căn nhà mình đang cần điều gì?',
      lead: 'Hôm nay, bạn muốn tìm hỗ trợ hay sẵn sàng nhận một việc phù hợp?',
      signature: 'Nhẹ nhàng chọn, rồi mình đi tiếp.',
    },
    {
      headline: 'Một buổi sáng dịu, mình bắt đầu từ điều cần nhất nhé.',
      lead: 'Bạn muốn nhờ hỗ trợ, hay sẵn sàng mang kỹ năng đến một ngôi nhà?',
      signature: 'Việc nhà có thể bớt nặng từ một lựa chọn đúng.',
    },
  ],
  midday: [
    {
      headline: 'Giữa trưa, mình dành một chút thời gian cho việc đang chờ nhé.',
      lead: 'Mình chọn cách đồng hành phù hợp, rồi bắt đầu từ việc cần nhất.',
      signature: 'Chậm một chút, rồi mọi việc sẽ vào nếp.',
    },
    {
      headline: 'Trưa nay, có việc nào ở nhà bạn muốn gỡ trước không?',
      lead: 'Bạn muốn tìm sự hỗ trợ, hay sẵn sàng nhận một việc phù hợp?',
      signature: 'Việc cần làm cũng xứng đáng được giải quyết nhẹ nhàng.',
    },
    {
      headline: 'Khoảng nghỉ ngắn, một khởi đầu gọn gàng.',
      lead: 'Chỉ cần chọn cách mình muốn bắt đầu, phần còn lại sẽ rõ ràng hơn.',
      signature: 'Đúng vai trò, đúng nhịp cho hôm nay.',
    },
    {
      headline: 'Trưa rồi, Kael sẵn sàng cùng bạn sắp xếp từng việc.',
      lead: 'Khách hàng hay Đối tác thợ — mỗi bên đều có một điểm bắt đầu.',
      signature: 'Kael ở đây để hành trình rõ ràng hơn.',
    },
    {
      headline: 'Một chút thời gian cho ngôi nhà cũng đủ làm mọi thứ nhẹ hơn.',
      lead: 'Dành vài giây để chọn đúng vai trò cho mình.',
      signature: 'Một lựa chọn nhỏ, một điểm bắt đầu tốt.',
    },
  ],
  afternoon: [
    {
      headline: 'Chiều nay, mình cùng hoàn thành một việc cho ngôi nhà nhé.',
      lead: 'Mình chọn cách bạn muốn bắt đầu, Kael sẽ đồng hành đúng nhịp.',
      signature: 'Việc đang chờ có thể được bắt đầu ngay lúc này.',
    },
    {
      headline: 'Buổi chiều dịu lại, việc cần làm cũng có thể nhẹ đi.',
      lead: 'Bạn đến để nhờ hỗ trợ, hay để mang kỹ năng của mình đến nơi cần?',
      signature: 'Đúng người, đúng việc, theo một cách nhẹ nhàng.',
    },
    {
      headline: 'Chiều rồi, bạn muốn Kael bắt đầu từ đâu?',
      lead: 'Bạn cần một người hỗ trợ, hay đang sẵn sàng nhận một việc?',
      signature: 'Căn nhà và công việc đều xứng đáng được chăm chút.',
    },
    {
      headline: 'Thêm một chút chủ động cho căn nhà của mình.',
      lead: 'Mỗi vai trò có một hành trình riêng, mình chọn trước nhé.',
      signature: 'Mình đi từng bước, thật rõ ràng.',
    },
    {
      headline: 'Chiều nay, tìm đúng người cho đúng việc nhé.',
      lead: 'Chỉ cần một lựa chọn, phần còn lại sẽ rõ ràng hơn.',
      signature: 'Chọn vai trò, rồi Kael cùng bạn bắt đầu.',
    },
  ],
  evening: [
    {
      headline: 'Tối nay, mình khép lại việc còn dang dở thật nhẹ nhàng nhé.',
      lead: 'Mình chọn cách bắt đầu để phần việc còn lại rõ ràng hơn.',
      signature: 'Không vội, chỉ cần bắt đầu từ điều cần nhất.',
    },
    {
      headline: 'Buổi tối yên, Kael vẫn ở đây khi bạn cần.',
      lead: 'Bạn muốn nhờ một người phù hợp, hay sẵn sàng nhận một việc gần nhà?',
      signature: 'Việc còn dang dở vẫn có thể được sắp xếp êm hơn.',
    },
    {
      headline: 'Đêm xuống rồi, một việc nhỏ cũng đáng được giải quyết.',
      lead: 'Bạn đến để nhờ hỗ trợ, hay để nhận một việc phù hợp?',
      signature: 'Đúng người, đúng lúc để mọi thứ dần yên.',
    },
    {
      headline: 'Tối nay, bạn muốn tìm người hỗ trợ hay bắt đầu nhận việc?',
      lead: 'Mình bắt đầu bằng việc chọn đúng chỗ đứng của mình nhé.',
      signature: 'Kael ở đây, từng bước một.',
    },
    {
      headline: 'Nhà mình cần được chăm chút, từng việc một.',
      lead: 'Một lựa chọn nhỏ để buổi tối nhẹ hơn.',
      signature: 'Một điểm bắt đầu nhẹ nhàng cho ngày mai.',
    },
  ],
}

export function selectRoleGateGreeting(now: Date, random: () => number = Math.random): RoleGateGreeting {
  const variants = roleGateGreetingVariants[greetingPeriodForHour(now.getHours())]
  const index = Math.min(variants.length - 1, Math.max(0, Math.floor(random() * variants.length)))
  return variants[index]
}

function greetingPeriodForHour(hour: number): RoleGateGreetingPeriod {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  return 'evening'
}
