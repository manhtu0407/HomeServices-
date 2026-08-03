import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  type KaelProgressTarget,
  type KaelProgressUpdate,
  updateKaelProgress,
} from "../../kael/index.ts";
import type { DbClient } from "../../platform/db.ts";
import { persistDiagnosisScopeArtifact } from "./case-work-artifact.ts";
import { appendKaelSystemTurn } from "./session-store.ts";

type KaelSystemTurn = Parameters<typeof appendKaelSystemTurn>[2];

type EmitKaelChatStepInput = {
  readonly artifact?: KaelDiagnosisScopeArtifact;
  readonly turn: KaelSystemTurn;
  readonly progress: KaelProgressUpdate;
  readonly parallel?: boolean;
};

export async function emitKaelChatStep(
  client: DbClient,
  sessionId: string,
  progressTarget: KaelProgressTarget,
  input: EmitKaelChatStepInput,
) {
  const artifact = input.artifact;
  const steps = [
    ...(artifact
      ? [() => persistDiagnosisScopeArtifact(client, sessionId, artifact)]
      : []),
    () => appendKaelSystemTurn(client, sessionId, input.turn),
    () => updateKaelProgress(client, progressTarget, input.progress),
  ];

  if (input.parallel) {
    await Promise.all(steps.map((step) => step()));
    return;
  }

  for (const step of steps) await step();
}
