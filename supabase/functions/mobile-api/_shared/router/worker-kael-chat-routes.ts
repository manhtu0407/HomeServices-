import type { UserRole } from "../../../_shared/domain.ts";

export type WorkerKaelChatRoute =
  | { kind: "workers.kaelChat.create"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.kaelChat.list"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelChat.archive"; method: "DELETE"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.pin"; method: "PATCH"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.rename"; method: "PATCH"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.get"; method: "GET"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.stream"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.turn"; method: "POST"; sessionId: string; roles: UserRole[] };

export function matchWorkerKaelChatRoute(
  path: string,
  method: string,
  decodePathSegment: (value: string) => string | null,
): WorkerKaelChatRoute | null {
  if (path === "/workers/me/kael/chat") {
    if (method === "GET") {
      return { kind: "workers.kaelChat.list", method: "GET", roles: ["worker", "admin"] };
    }
    if (method === "POST") {
      return {
        kind: "workers.kaelChat.create",
        method: "POST",
        roles: ["worker", "admin"],
        successStatus: 201,
      };
    }
    return null;
  }

  const stream = path.match(/^\/workers\/me\/kael\/chat\/([^/]+)\/stream$/);
  if (stream) {
    const sessionId = decodePathSegment(stream[1] ?? "");
    return method === "POST" && sessionId
      ? { kind: "workers.kaelChat.stream", method: "POST", sessionId, roles: ["worker", "admin"] }
      : null;
  }

  const pin = path.match(/^\/workers\/me\/kael\/chat\/([^/]+)\/pin$/);
  if (pin) {
    const sessionId = decodePathSegment(pin[1] ?? "");
    return method === "PATCH" && sessionId
      ? { kind: "workers.kaelChat.pin", method: "PATCH", sessionId, roles: ["worker", "admin"] }
      : null;
  }

  const session = path.match(/^\/workers\/me\/kael\/chat\/([^/]+)$/);
  if (!session) return null;
  const sessionId = decodePathSegment(session[1] ?? "");
  if (!sessionId) return null;

  if (method === "GET") {
    return { kind: "workers.kaelChat.get", method: "GET", sessionId, roles: ["worker", "admin"] };
  }
  if (method === "DELETE") {
    return { kind: "workers.kaelChat.archive", method: "DELETE", sessionId, roles: ["worker", "admin"] };
  }
  if (method === "PATCH") {
    return { kind: "workers.kaelChat.rename", method: "PATCH", sessionId, roles: ["worker", "admin"] };
  }
  if (method === "POST") {
    return { kind: "workers.kaelChat.turn", method: "POST", sessionId, roles: ["worker", "admin"] };
  }
  return null;
}
