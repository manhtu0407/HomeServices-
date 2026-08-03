import type { UserRole } from "../../../../_shared/domain.ts";

// GET /kael/charter stays in the index next to PublicRoute — it is the one public route and
// isPublicRoute narrows on that type. All three paths are exact distinct literals, so keeping
// charter ahead of these two does not depend on evaluation order.
export type KaelRoute =
  | {
    kind: "kael.chat.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "kael.assistant";
    method: "POST";
    roles: UserRole[];
  };

export function matchKaelRoute(path: string, method: string): KaelRoute | null {
  if (method === "POST" && path === "/kael/chat") {
    return {
      kind: "kael.chat.create",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (method === "POST" && path === "/kael/assistant") {
    return {
      kind: "kael.assistant",
      method: "POST",
      roles: ["customer"],
    };
  }
  return null;
}
