import type { UserRole } from "../../../_shared/domain.ts";

export type CustomerKaelConversationRoute =
  | { kind: "customer.kaelConversations.create"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "customer.kaelConversations.list"; method: "GET"; roles: UserRole[] }
  | { kind: "customer.kaelConversations.archive"; method: "DELETE"; conversationId: string; roles: UserRole[] }
  | { kind: "customer.kaelConversations.rename"; method: "PATCH"; conversationId: string; roles: UserRole[] }
  | { kind: "customer.kaelConversations.pin"; method: "PATCH"; conversationId: string; roles: UserRole[] }
  | { kind: "customer.kaelConversations.get"; method: "GET"; conversationId: string; roles: UserRole[] }
  | { kind: "customer.kaelConversations.stream"; method: "POST"; conversationId: string; roles: UserRole[] }
  | { kind: "customer.kaelConversations.turn"; method: "POST"; conversationId: string; roles: UserRole[] };

export function matchCustomerKaelConversationRoute(
  path: string,
  method: string,
  decodePathSegment: (value: string) => string | null,
): CustomerKaelConversationRoute | null {
  if (path === "/me/kael/conversations") {
    if (method === "GET") {
      return { kind: "customer.kaelConversations.list", method: "GET", roles: ["customer"] };
    }
    if (method === "POST") {
      return {
        kind: "customer.kaelConversations.create",
        method: "POST",
        roles: ["customer"],
        successStatus: 201,
      };
    }
    return null;
  }

  const match = path.match(/^\/me\/kael\/conversations\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null;
  const conversationId = decodePathSegment(match[1] ?? "");
  if (!conversationId) return null;
  const action = match[2];

  if (!action && method === "GET") {
    return { kind: "customer.kaelConversations.get", method: "GET", conversationId, roles: ["customer"] };
  }
  if (!action && method === "DELETE") {
    return { kind: "customer.kaelConversations.archive", method: "DELETE", conversationId, roles: ["customer"] };
  }
  if (!action && method === "PATCH") {
    return { kind: "customer.kaelConversations.rename", method: "PATCH", conversationId, roles: ["customer"] };
  }
  if (action === "pin" && method === "PATCH") {
    return { kind: "customer.kaelConversations.pin", method: "PATCH", conversationId, roles: ["customer"] };
  }
  if (action === "turn" && method === "POST") {
    return { kind: "customer.kaelConversations.turn", method: "POST", conversationId, roles: ["customer"] };
  }
  if (action === "stream" && method === "POST") {
    return { kind: "customer.kaelConversations.stream", method: "POST", conversationId, roles: ["customer"] };
  }
  return null;
}
