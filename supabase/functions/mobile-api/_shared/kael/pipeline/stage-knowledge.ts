import type { ServiceType } from "../contracts/types.ts";
import { retrieveKaelKnowledgeContextIfEnabled } from "../tools/knowledge.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import { updateKaelProgress } from "./streaming.ts";

export async function runKaelKnowledgeStage(
  prepared: PreparedKaelPipeline,
  input: {
    serviceType: ServiceType;
    problemSlug: string;
  },
) {
  const {
    supabase,
    secrets,
    problemChips,
    description,
    progressTarget,
  } = prepared;
  const knowledgeContext = await retrieveKaelKnowledgeContextIfEnabled(supabase, {
    serviceType: input.serviceType,
    problemSlug: input.problemSlug,
    safetyTopic: "worker_safety_advisory",
    legalTopic: "legal_safety_awareness",
    queryText: `${problemChips.join(" ")} ${description}`.trim(),
    usageContext: {
      jobId: typeof progressTarget === "string"
        ? progressTarget
        : progressTarget?.table === "jobs"
        ? progressTarget.id ?? null
        : null,
      sessionId: typeof progressTarget === "object" &&
          progressTarget.table === "kael_chat_sessions"
        ? progressTarget.id ?? null
        : null,
      surface: "kael_pipeline",
    },
  }, secrets);

  await Promise.all([
    updateKaelProgress(supabase, progressTarget, {
      stage: "vision_analysis",
      status: "running",
      progress: 0.3,
    }),
    updateKaelProgress(supabase, progressTarget, {
      stage: "market_lookup",
      status: "running",
      progress: 0.32,
    }),
    updateKaelProgress(supabase, progressTarget, {
      stage: "problem_synthesis",
      status: "running",
      progress: 0.34,
    }),
  ]);

  return { knowledgeContext };
}
