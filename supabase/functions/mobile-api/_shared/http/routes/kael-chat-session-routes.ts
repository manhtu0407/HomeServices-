import type { UserRole } from "../../../../_shared/domain.ts";

export type CustomerKaelChatSessionRoute =
  | { kind: "kael.chat.get"; method: "GET"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.progress"; method: "GET"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.stream"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.evidenceStream"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.turn"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.intakeConfirmation"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.confirm"; method: "POST"; sessionId: string; roles: UserRole[]; successStatus: 202 }
  | { kind: "kael.chat.operation"; method: "GET"; sessionId: string; roles: UserRole[] }
  | { kind: "kael.chat.evidence"; method: "POST"; sessionId: string; roles: UserRole[] };

type DecodePathSegment = (segment: string) => string | null;

export function matchCustomerKaelChatSessionRoute(
  path: string,
  method: string,
  decodePathSegment: DecodePathSegment,
): CustomerKaelChatSessionRoute | null {
  const match = path.match(/^\/kael\/chat\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null;

  const sessionId = decodePathSegment(match[1] ?? "");
  if (!sessionId) return null;

  const action = match[2];
  const roles: UserRole[] = ["customer", "admin"];
  if (!action && method === "GET") return { kind: "kael.chat.get", method: "GET", sessionId, roles };
  if (!action && method === "POST") return { kind: "kael.chat.turn", method: "POST", sessionId, roles };
  if (action === "progress" && method === "GET") return { kind: "kael.chat.progress", method: "GET", sessionId, roles };
  if (action === "stream" && method === "POST") return { kind: "kael.chat.stream", method: "POST", sessionId, roles };
  if (action === "evidence-stream" && method === "POST") return { kind: "kael.chat.evidenceStream", method: "POST", sessionId, roles };
  if (action === "intake-confirmation" && method === "POST") {
    return { kind: "kael.chat.intakeConfirmation", method: "POST", sessionId, roles };
  }
  if (action === "confirm" && method === "POST") return {
    kind: "kael.chat.confirm", method: "POST", sessionId, roles, successStatus: 202,
  };
  if (action === "operation" && method === "GET") return { kind: "kael.chat.operation", method: "GET", sessionId, roles };
  if (action === "evidence" && method === "POST") return { kind: "kael.chat.evidence", method: "POST", sessionId, roles };
  return null;
}
