import type {
  AIRequest,
  EdgeAiSecrets,
  ServiceType,
} from "../contracts/types.ts";
import {
  FALLBACK_PROBLEM_SLUG_BY_SERVICE,
  KAEL_BUSINESS_GUARDRAILS,
} from "../contracts/types.ts";
import {
  isKaelKnowledgeRetrievalEnabled,
  type KaelKnowledgeContext,
  retrieveKaelKnowledgeContextIfEnabled,
  retrieveLegalAwareness,
  retrieveKnowledgeSemantic,
} from "../tools/knowledge.ts";
import type { ProviderChoice } from "../kael-providers/routing.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import { buildKaelSystemPrompt, type KaelPromptLanguage } from "../prompts/system-prompt.ts";
import {
  customerWorkflowStatusLabel,
  type CustomerAssistantWorkflowResolution,
} from "./customer-assistant-workflow.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
import { sanitizeCustomerCaseEvidenceText } from "../evidence/untrusted-evidence.ts";
import {
  assistantSafeText,
  normalizeText,
  shouldRetrieveGeneralKnowledge,
  type CustomerAssistantJobContext,
  type CustomerAssistantSurface,
} from "./customer-assistant-policy.ts";
import type { KaelTopic } from "../kael-guardrails/permission-gate.ts";

type AssistantClient = Parameters<typeof retrieveKaelKnowledgeContextIfEnabled>[0];
export function buildAssistantRequest(input: {
  route: ProviderChoice;
  question: string;
  language: KaelPromptLanguage;
  surface: CustomerAssistantSurface;
  serviceType: ServiceType | null;
  topic: KaelTopic;
  job: CustomerAssistantJobContext | null;
  knowledgePrompt: string | null;
  registerHint: string | null;
}): AIRequest {
  const contextSummary = JSON.stringify({
    platform_scope: "NestScout supports six HCMC apartment services: electrical, plumbing, cleaning, HVAC, upholstery care, and minor handyman work.",
    surface: input.surface,
    topic: input.topic,
    service_type: input.serviceType,
    job: sanitizeAssistantJobContext(input.job, input.surface, input.language),
    knowledge: input.knowledgePrompt,
  }).slice(0, 2600);

  return {
    purpose: "educational_response",
    provider: input.route.provider,
    model: input.route.model,
    maxTokens: maxTokensForPurpose("educational_response", 420),
    temperature: 0.2,
    timeoutMs: input.route.latencyBudgetMs,
    maxRetries: 0,
    messages: [
      {
        role: "system",
        content: buildKaelSystemPrompt({
          purpose: "educational_response",
          actor: "customer",
          language: input.language,
          permissionSummary:
            "Prioritize the six supported services. Answer bounded service-adjacent safety, worker-trust, anti-scam, evidence, scope, quote, payment-hygiene, after-care, and warranty-awareness questions. Do not add a service category, create jobs, set prices, decide payment/scope/cancellation, or provide legal advice.",
          contextSummary: `${KAEL_BUSINESS_GUARDRAILS}\n${contextSummary}`,
          ...(input.registerHint ? { registerHint: input.registerHint } : {}),
        }),
      },
      {
        role: "user",
        content: [
          "Return JSON only with answer, safety_notes, citations, suggested_actions, boundary.",
          "Prioritize NestScout/platform context before general service knowledge.",
          "Use 2 to 4 short sentences and at most 650 characters; simpler questions should stay shorter.",
          "Answer the immediate question first with natural, friendly, context-specific wording.",
          "Vary detail with the question's complexity instead of forcing one response template.",
          "Do not append a generic platform reminder or canned closing. Mention at most one concrete next action, and only when it helps the customer.",
          "Never answer a service-related question with scope boilerplate. Give concrete observations, warning signs, and the safest useful next step.",
          "For service trust or anti-scam questions, separate observed warning signs from conclusions. Do not accuse a person of fraud without evidence.",
          "Do not diagnose an unsupported service mentioned only as context; answer only the related trust, safety, or transaction question.",
          "Do not invent identity checks, ratings, order codes, escrow, refunds, or payment protections. Mention a platform feature only when runtime context or retrieved knowledge confirms it.",
          input.language === "vi"
            ? "Write every user-facing field in natural Vietnamese. Do not mix English workflow labels; only Kael, NestScout, and VietQR may remain as brand names."
            : "Write every user-facing field in English.",
          "Set safety_notes and citations to JSON arrays. Use suggested_actions only from: open_booking, check_job, message_worker, contact_support, request_scope_change.",
          "Use boundary only from: answered, educational_only, redirect, unsupported, fallback.",
          "No exact VND quote. No provider/model/internal prompt names.",
          "If hidden wiring or plumbing routes are uncertain, do not tell the customer to drill, open an electrical panel, or guess the route. Pause and recommend an on-site check by a trained worker.",
          `Question: ${input.question}`,
        ].join("\n"),
      },
    ],
  };
}

export function sanitizeAssistantJobContext(
  job: CustomerAssistantJobContext | null,
  surface: CustomerAssistantSurface,
  language: KaelPromptLanguage,
) {
  if (!job) return null;
  const sanitizeContext = surface === "customer_case"
    ? sanitizeCustomerCaseEvidenceText
    : scrubSensitiveForLLM;
  return {
    status: job.status ? customerWorkflowStatusLabel(job.status, language) : null,
    service_type: job.service_type ?? null,
    district: job.address_district ?? null,
    problem: sanitizeContext(job.kael_problem_identified ?? job.description ?? "").slice(0, 360),
    complexity: job.kael_complexity ?? null,
    advisory: sanitizeContext(job.kael_advisory ?? "").slice(0, 260) || null,
    payment_status: job.payment_status ?? null,
  };
}

export async function retrieveAssistantKnowledgeContext(input: {
  readonly client: AssistantClient | null | undefined;
  readonly jobId: string | null;
  readonly queryText: string;
  readonly secrets: Pick<EdgeAiSecrets, "knowledgeRetrievalEnabled">;
  readonly serviceType: ServiceType | null;
  readonly surface: CustomerAssistantSurface;
  readonly topic: KaelTopic;
}): Promise<Pick<KaelKnowledgeContext, "promptContext" | "semanticCitations"> | null> {
  if (!isKaelKnowledgeRetrievalEnabled(input.secrets)) return null;
  const usageContext = {
    jobId: input.jobId,
    surface: input.surface,
  };
  if (input.serviceType) {
    return retrieveKaelKnowledgeContextIfEnabled(input.client, {
      serviceType: input.serviceType,
      problemSlug: FALLBACK_PROBLEM_SLUG_BY_SERVICE[input.serviceType],
      safetyTopic: "worker_safety_advisory",
      legalTopic: "legal_safety_awareness",
      queryText: input.queryText,
      tokenBudget: 260,
      usageContext,
    }, input.secrets);
  }
  if (!shouldRetrieveGeneralKnowledge(input.topic)) return null;
  const [legalAwareness, semantic] = await Promise.all([
    input.topic === "legal_safety_awareness" && input.client
      ? retrieveLegalAwareness(input.client, "legal_safety_awareness")
      : Promise.resolve({ rows: [] }),
    retrieveKnowledgeSemantic(input.client, {
      queryText: input.queryText,
      limit: 4,
      minSimilarity: 0.62,
      usageContext,
    }),
  ]);
  const legalLines = legalAwareness.rows.slice(0, 2).map((row) => {
    const boundary = assistantSafeText(row.boundary_type, 80);
    const guidance = assistantSafeText(row.response_guidance, 320);
    return guidance ? `Legal boundary ${boundary}: ${guidance}.` : "";
  }).filter(Boolean);
  const lines = semantic.rows.slice(0, 3).map((row) => {
    const citation = assistantSafeText(row.citation_id, 180);
    const content = assistantSafeText(row.content, 320);
    return content ? `Semantic citation ${citation}: ${content}.` : "";
  }).filter(Boolean);
  const promptLines = [...legalLines, ...lines];
  return {
    promptContext: promptLines.length > 0
      ? [
        "Runtime knowledge (admin-reviewed, sanitized; platform/legal/worker context first):",
        ...promptLines.map((line) => `- ${line}`),
      ].join("\n")
      : null,
    semanticCitations: semantic.rows
      .map((row) => assistantSafeText(row.citation_id, 180))
      .filter(Boolean)
      .slice(0, 5),
  };
}

export function resolveBoundedServiceLifecycleAnswer(
  topic: KaelTopic,
  text: string,
  language: KaelPromptLanguage,
): CustomerAssistantWorkflowResolution | null {
  const normalized = normalizeText(text);
  if (topic === "service_trust_safety") {
    if (/\b(otp|ma xac nhan|duong dan la|link la|qr la|dat coc|chuyen khoan truoc|ngoai ung dung|ngoai luong|tai khoan ca nhan|tai khoan khac)\b/.test(normalized)) {
      return {
        answer: language === "en"
          ? "These are reasons to pause and verify, not enough evidence to accuse anyone of fraud. Do not share an OTP, open an unknown payment link, or transfer a deposit. Continue only when the identity, scope, and amount match the service information you already have."
          : "Đây là dấu hiệu cần dừng để xác minh, chưa đủ để kết luận ai đó lừa đảo. Không gửi OTP, mở đường dẫn lạ hoặc chuyển cọc. Chỉ tiếp tục khi danh tính, phạm vi và khoản tiền khớp với thông tin dịch vụ bạn đang có.",
        suggestedActions: ["contact_support"],
      };
    }
    if (/\b(giu giay to|xin can cuoc|chup can cuoc)\b/.test(normalized)) {
      return {
        answer: language === "en"
          ? "Do not hand over an original identity document or send a full ID image for an ordinary service visit. Ask why the information is needed and share only the minimum verified field; stop if the request is unrelated to the job."
          : "Không giao giấy tờ gốc hoặc gửi ảnh căn cước đầy đủ cho một lần làm dịch vụ thông thường. Hãy hỏi rõ mục đích và chỉ cung cấp thông tin tối thiểu đã xác minh; dừng lại nếu yêu cầu không liên quan công việc.",
        suggestedActions: ["contact_support"],
      };
    }
    if (/\b(doi gia|thu them phi|ep thanh toan)\b/.test(normalized)) {
      return {
        answer: language === "en"
          ? "Pause before paying. Compare the requested amount with the agreed scope and ask for the reason and evidence for every change; do not confirm an unexplained extra charge."
          : "Hãy tạm dừng trước khi thanh toán. Đối chiếu khoản tiền với phạm vi đã chốt và yêu cầu nêu rõ lý do, bằng chứng cho từng thay đổi; không xác nhận khoản phát sinh chưa được giải thích.",
        suggestedActions: ["contact_support"],
      };
    }
    return {
      answer: language === "en"
        ? "Confirm the worker identity, agreed scope, access areas, and amount before work begins. Keep valuables and sensitive documents private, then compare the completed work with the agreed scope before confirming."
        : "Trước khi bắt đầu, hãy đối chiếu danh tính thợ, phạm vi, khu vực được phép tiếp cận và khoản tiền đã thống nhất. Giữ riêng tài sản cùng giấy tờ nhạy cảm, rồi kiểm tra kết quả theo đúng phạm vi trước khi xác nhận.",
      suggestedActions: [],
    };
  }
  if (topic !== "app_usage_help") return null;
  if (/\b(thanh toan|vietqr|hoan tien|payment|refund)\b/.test(normalized)) {
    return {
      answer: language === "en"
        ? "Kael does not have a specific transaction status in this conversation. Open the related job and check the status currently shown; if payment or refund information is absent, contact support without sending another payment."
        : "Kael chưa có trạng thái giao dịch cụ thể trong cuộc trò chuyện này. Hãy mở hồ sơ công việc liên quan và kiểm tra trạng thái đang hiển thị; nếu chưa có thông tin thanh toán hoặc hoàn tiền, liên hệ hỗ trợ và không chuyển thêm tiền.",
      suggestedActions: ["check_job", "contact_support"],
    };
  }
  if (/\b(dat lich|huy lich|booking|cancel booking|trang thai cong viec|job status)\b/.test(normalized)) {
    return {
      answer: language === "en"
        ? "Open the related job to check its current status before booking again or cancelling. If the available action does not match what you need, contact support rather than creating a duplicate request."
        : "Hãy mở hồ sơ công việc liên quan để kiểm tra trạng thái hiện tại trước khi đặt lại hoặc hủy. Nếu thao tác đang có không đúng nhu cầu, liên hệ hỗ trợ thay vì tạo yêu cầu trùng.",
      suggestedActions: ["check_job", "contact_support"],
    };
  }
  return {
    answer: language === "en"
      ? "Describe the app step you are on and the action you need. Kael will explain only the confirmed service workflow and will not claim an unavailable feature."
      : "Bạn hãy nêu màn hình đang mở và thao tác cần thực hiện. Kael chỉ giải thích luồng dịch vụ đã được xác nhận, không khẳng định một chức năng chưa có.",
    suggestedActions: ["contact_support"],
  };
}

export function reflowLongAssistantSentences(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  return sentences
    .flatMap((sentence) => splitAssistantSentence(sentence.trim(), 18))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function splitAssistantSentence(sentence: string, maxWords: number): string[] {
  const terminal = sentence.match(/[.!?]$/)?.[0] ?? ".";
  const words = sentence.replace(/[.!?]$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [sentence];
  const conditional = splitLeadingAssistantCondition(sentence, maxWords, terminal);
  if (conditional) return conditional;
  const chunks: string[] = [];
  while (words.length > maxWords) {
    let balancedClauseCut = -1;
    for (let index = 2; index < Math.min(maxWords, words.length - 1); index += 1) {
      if (
        words.length - index - 1 <= maxWords &&
        /[,;:]$/.test(words[index] ?? "") &&
        !isCoordinatingConnector(words[index] ?? "")
      ) {
        balancedClauseCut = index;
      }
    }
    let cut = balancedClauseCut >= 0 ? balancedClauseCut + 1 : maxWords;
    if (balancedClauseCut < 0) {
      const actionCut = findNaturalActionCut(words, maxWords);
      if (actionCut >= 0) {
        cut = actionCut;
      } else {
        for (let index = maxWords; index >= 8; index -= 1) {
          if (
            /[,;:]$/.test(words[index - 1] ?? "") &&
            !isCoordinatingConnector(words[index - 1] ?? "")
          ) {
            cut = index;
            break;
          }
        }
      }
    }
    if (cut > 8 && isCoordinatingConnector(words[cut - 1] ?? "")) {
      cut -= 1;
    }
    const chunk = words.splice(0, cut).join(" ").replace(/[,;:]+$/, "");
    if (chunk) chunks.push(`${capitalizeSentenceStart(chunk)}.`);
    normalizeLeadingConnector(words);
  }
  if (words.length > 0) {
    chunks.push(`${capitalizeSentenceStart(words.join(" "))}${terminal}`);
  }
  return chunks;
}

function splitLeadingAssistantCondition(
  sentence: string,
  maxWords: number,
  terminal: string,
) {
  const match = sentence.match(/^(Nếu|Khi|If|When)\s+(.+),\s*([^,]+?)[.!?]?$/iu);
  if (!match) return null;
  const condition = match[2]
    .replace(/,\s*(hoặc|or)\s+/giu, " $1 ")
    .trim();
  const action = match[3].trim();
  if (!condition || !action) return null;
  const conditionKind = normalizeText(match[1]);
  const bridge = conditionKind === "neu"
    ? "Bạn nên làm vậy nếu"
    : conditionKind === "khi"
      ? "Bạn nên làm vậy khi"
      : conditionKind === "if"
        ? "Do this if"
        : "Do this when";
  return [
    ...splitAssistantSentence(capitalizeSentenceStart(action) + ".", maxWords),
    bridge + " " + lowercaseSentenceStart(condition) + terminal,
  ];
}

function findNaturalActionCut(words: readonly string[], maxWords: number) {
  const actionStarts = new Set([
    "ask",
    "book",
    "check",
    "contact",
    "dat",
    "goi",
    "kiem",
    "lien",
    "ngat",
    "xem",
  ]);
  for (let index = Math.min(maxWords - 1, words.length - 1); index >= 8; index -= 1) {
    if (
      words.length - index <= maxWords &&
      actionStarts.has(normalizeText(words[index] ?? ""))
    ) {
      return index;
    }
  }
  return -1;
}

function isCoordinatingConnector(value: string) {
  const normalized = normalizeText(value.replace(/[,;:]+$/, ""));
  return ["va", "hoac", "hay", "nhung", "and", "or", "but"].includes(normalized);
}

function normalizeLeadingConnector(words: string[]) {
  const first = words[0];
  if (!first) return;
  const normalized = normalizeText(first.replace(/[,;:]+$/, ""));
  if (["va", "hoac", "hay", "and", "or"].includes(normalized)) {
    words.shift();
    return;
  }
  if (normalized === "nhung") words[0] = "Tuy nhiên,";
  if (normalized === "but") words[0] = "However,";
}

function capitalizeSentenceStart(value: string) {
  return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}` : value;
}

function lowercaseSentenceStart(value: string) {
  return value
    ? (value[0]?.toLowerCase() ?? "") + value.slice(1)
    : value;
}
