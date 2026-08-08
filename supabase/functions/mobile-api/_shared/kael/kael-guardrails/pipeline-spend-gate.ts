import type { EdgeAiSecrets, PipelineInput, PipelineStageLog, SupabaseLike } from "../contracts/types.ts";
import { createRuntimeKaelSpendGate, type SpendGateClient } from "./spend-gate.ts";
import { checkKaelProviderBudget, recordKaelProviderSpend } from "../kael-providers/provider-budget.ts";

export async function prepareKaelPipelineSpendGate(
  input: Pick<PipelineInput, "actorId">,
  supabase: SupabaseLike,
  stageLogs: readonly PipelineStageLog[],
  secrets: EdgeAiSecrets,
) {
  const spendGate = createRuntimeKaelSpendGate(
    (secrets.harnessTrace?.client ?? supabase) as unknown as SpendGateClient,
    input.actorId ?? null,
    secrets.harnessTrace,
  );
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
