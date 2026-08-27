import { z } from "zod";

export const ADMIN_OPERATOR_CAPABILITIES = [
  "operations.read", "operations.triage", "workers.read", "workers.review", "workers.manage",
  "transactions.read", "finance.read", "finance.reconcile",
  "finance.tax.manage", "payouts.read", "payouts.process", "team.read", "system.read", "system.manage",
] as const;

const capabilitySchema = z.enum(ADMIN_OPERATOR_CAPABILITIES);
const passwordSchema = z.string().min(8).max(128);

export const adminOperatorProvisionSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().refine(
    (email) => /^[^\s@]+@gmail\.com$/.test(email),
    "Only gmail.com addresses are supported",
  ),
  initial_password: passwordSchema,
  capabilities: z.array(capabilitySchema).max(ADMIN_OPERATOR_CAPABILITIES.length),
}).strict().superRefine((value, context) => {
  if (new Set(value.capabilities).size !== value.capabilities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "Capabilities must be unique",
    });
  }
  if (value.capabilities.includes("operations.triage") && !value.capabilities.includes("operations.read")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "operations.triage requires operations.read",
    });
  }
  if (value.capabilities.includes("system.manage") && !value.capabilities.includes("system.read")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "system.manage requires system.read",
    });
  }
}).transform((value) => ({
  ...value,
  capabilities: Array.from(new Set([
    "finance.read" as const,
    "system.read" as const,
    ...value.capabilities,
  ])),
}));

export const adminOperatorResetPasswordSchema = z.object({
  initial_password: passwordSchema,
}).strict();

export const adminOperatorActivationSchema = z.object({
  current_password: passwordSchema,
  new_password: passwordSchema,
}).strict().superRefine((value, context) => {
  if (value.current_password === value.new_password) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["new_password"],
      message: "The replacement password must be different",
    });
  }
});

export type EdgeAdminOperatorProvisionInput = z.infer<typeof adminOperatorProvisionSchema>;
export type EdgeAdminOperatorResetPasswordInput = z.infer<typeof adminOperatorResetPasswordSchema>;
export type EdgeAdminOperatorActivationInput = z.infer<typeof adminOperatorActivationSchema>;
