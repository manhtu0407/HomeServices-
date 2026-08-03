import type { PipelineInput, PipelineStageLog, SupabaseLike } from "../contracts/types.ts";
import type { KaelSpendGate, SpendGateClient } from "./spend-gate.ts";
import { checkKaelProviderBudget, recordKaelProviderSpend } from "../kael-providers/provider-budget.ts";

export async function prepareKaelPipelineSpendGate(
  input: Pick<PipelineInput, "actorId">,
  supabase: SupabaseLike,
  stageLogs: readonly PipelineStageLog[],
) {
  const spendGate: KaelSpendGate = {
    client: supabase as unknown as SpendGateClient,
    actorId: input.actorId ?? null,
  };
  const providerBudget = await checkKaelProviderBudget(supabase);
  const recordProviderSpendIfEnforced = async () => {
    if (!providerBudget.enforced) return;
    const spentUsd = stageLogs.reduce(
      (sum, log) => sum + (typeof log.costUsd === "number" ? log.costUsd : 0),
      0,
    );
    await recordKaelProviderSpend(supabase, spentUsd);
  };

  return {
    providerBudget,
    recordProviderSpendIfEnforced,
    spendGate,
  };
}
