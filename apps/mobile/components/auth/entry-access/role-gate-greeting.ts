import type { AppLanguage } from '@/lib/app-language'
import {
  roleGateGreetingVariants as roleGateGreetingVariantsByLanguage,
  type RoleGateGreeting,
  type RoleGateGreetingPeriod,
} from './copy'

export type { RoleGateGreeting } from './copy'
export { roleGateGreetingVariantsByLanguage }

export const roleGateGreetingVariants = roleGateGreetingVariantsByLanguage.vi

export function selectRoleGateGreeting(
  now: Date,
  random: () => number = Math.random,
  language: AppLanguage = 'vi',
): RoleGateGreeting {
  const variants = roleGateGreetingVariantsByLanguage[language][greetingPeriodForHour(now.getHours())]
  const index = Math.min(variants.length - 1, Math.max(0, Math.floor(random() * variants.length)))
  return variants[index]!
}

function greetingPeriodForHour(hour: number): RoleGateGreetingPeriod {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  return 'evening'
}
