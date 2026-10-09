import type { EdgeLegacyConfirmationRecoveryInput } from "../../../../_shared/contracts/legacy-confirmation-recovery.ts";
import type { MobileApiContext } from "../contracts.ts";

export type LegacyConfirmationRecoveryServices = {
  recoverLegacyKaelConfirmation(
    ctx: MobileApiContext, sessionId: string, input: EdgeLegacyConfirmationRecoveryInput,
  ): Promise<Record<string, unknown>>;
};
