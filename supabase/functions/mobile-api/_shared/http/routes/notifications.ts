import type { UserRole } from "../../../../_shared/domain.ts";

export type NotificationRoute =
  | { kind: "notifications"; method: "GET"; roles: UserRole[] }
  | { kind: "notifications.deviceToken"; method: "POST"; roles: UserRole[] }
  | { kind: "notifications.matchingDeliveryAck"; method: "POST"; roles: UserRole[] }
  | {
    kind: "notifications.deviceToken.unregister";
    method: "DELETE";
    roles: UserRole[];
  };

export type NotificationReadRoute = {
  kind: "notifications.read";
  method: "POST";
  notificationId: string;
  roles: UserRole[];
};

// Two matchers, not one. In the chain these sit far apart — the collection routes are matched
// early, the per-notification read is the last branch before the chain gives up. Merging them
// into a single call would move the read branch ahead of every route in between.
export function matchNotificationRoute(path: string, method: string): NotificationRoute | null {
  if (method === "GET" && path === "/notifications") {
    return {
      kind: "notifications",
      method: "GET",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/notifications/device-token") {
    return {
      kind: "notifications.deviceToken",
      method: "POST",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/notifications/matching-delivery-ack") {
    return {
      kind: "notifications.matchingDeliveryAck",
      method: "POST",
      roles: ["worker"],
    };
  }
  if (method === "DELETE" && path === "/notifications/device-token") {
    return {
      kind: "notifications.deviceToken.unregister",
      method: "DELETE",
      roles: ["customer", "worker", "admin"],
    };
  }
  return null;
}

export function matchNotificationReadRoute(
  path: string,
  method: string,
  decodeSegment: (segment: string) => string | null,
): NotificationReadRoute | null {
  const notification = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (notification && method === "POST") {
    const notificationId = decodeSegment(notification[1] ?? "");
    if (!notificationId) return null;
    return {
      kind: "notifications.read",
      method: "POST",
      notificationId,
      roles: ["customer", "worker", "admin"],
    };
  }
  return null;
}
