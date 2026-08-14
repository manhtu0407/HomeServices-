import { z } from 'zod'
import { ADMIN_CAPABILITIES } from '../constants'

const adminCapabilitySchema = z.enum(ADMIN_CAPABILITIES)
const passwordSchema = z.string().min(8).max(128)

export const adminOperatorProvisionSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().refine(
    (email) => /^[^\s@]+@gmail\.com$/.test(email),
    'Only gmail.com addresses are supported',
  ),
  initial_password: passwordSchema,
  capabilities: z.array(adminCapabilitySchema).max(ADMIN_CAPABILITIES.length),
}).strict().superRefine((value, context) => {
  if (new Set(value.capabilities).size !== value.capabilities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capabilities'],
      message: 'Capabilities must be unique',
    })
  }
}).transform((value) => ({
  ...value,
  capabilities: value.capabilities.includes('finance.read')
    ? value.capabilities
    : ['finance.read' as const, ...value.capabilities],
}))

export const adminOperatorResetPasswordSchema = z.object({
  initial_password: passwordSchema,
}).strict()

export const adminOperatorActivationSchema = z.object({
  current_password: passwordSchema,
  new_password: passwordSchema,
}).strict().superRefine((value, context) => {
  if (value.current_password === value.new_password) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['new_password'],
      message: 'The replacement password must be different',
    })
  }
})

export type AdminOperatorProvisionInput = z.infer<typeof adminOperatorProvisionSchema>
export type AdminOperatorResetPasswordInput = z.infer<typeof adminOperatorResetPasswordSchema>
export type AdminOperatorActivationInput = z.infer<typeof adminOperatorActivationSchema>
