import type { EdgeAdminOperatorActivationInput } from "../../../../_shared/domain.ts";
import type { AdminControlCapability } from "./admin-control.ts";

export type AdminActivationStatusResponse = {
  required: boolean;
  status: "pending_password_change" | "active" | "failed" | null;
  email_masked: string | null;
  full_name: string | null;
  capability_count: number;
};

export type AdminActivationResponse = {
  ok: true;
  role: "admin_operator";
  capabilities: AdminControlCapability[];
  activated_at: string;
};

export type { EdgeAdminOperatorActivationInput };
