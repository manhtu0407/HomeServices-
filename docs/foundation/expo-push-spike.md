# Expo Push Spike — 2026-05-20

Status: execution input for workflow enhancement. This is not a production rollout approval.

## Decision

Use Expo Push Service for operational workflow notifications. Notification rows remain the source of truth; push delivery is a best-effort delivery channel.

Primary sources:
- https://docs.expo.dev/versions/v54.0.0/sdk/notifications/
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://docs.expo.dev/push-notifications/push-notifications-setup/

## Current Code State

- Database and Edge already support `notifications` and `device_push_tokens`.
- Edge route exists for `POST /notifications/device-token`.
- Mobile has inbox polling and mark-read support.
- Mobile does not currently depend on `expo-notifications`.
- Edge now has a best-effort Expo Push Service helper for workflow notifications.
- Mobile runtime token registration is still blocked until `expo-notifications` is added to the Expo app dependencies.

## Mobile Requirements

Add `expo-notifications` before runtime push registration work. The mobile client should:

1. Request notification permission after authenticated profile load, not before role selection.
2. Get an Expo push token only when permission is granted.
3. Register the token through `/notifications/device-token`.
4. Store safe metadata only: platform and non-PII runtime hints.
5. Use deep links for operational screens, but keep database state authoritative after app open.

Push setup must handle denied permissions honestly. The app may show a Vietnamese prompt explaining that workflow updates work better with notifications, but it must not pretend push is enabled if the OS denies permission.

## Server Requirements

Implemented Edge helper shape:

```text
sendPushToUsers(userIds, payload)
-
|- load enabled Expo push tokens from device_push_tokens
|- batch messages by Expo limit
|- send via HTTPS with timeout
|- log safe failures by user id / token id / status code
|- never include PII in title/body
```

Do not make push delivery part of the database transaction. The workflow state transition should commit first; push failures should leave notification rows for in-app recovery.

## Allowed Notification Copy

Vietnamese-first and PII-free:

- Customer: `Đã có thợ nhận việc`
- Customer: `Đang tìm thợ thay thế`
- Customer: `Thợ đã cập nhật trạng thái`
- Customer/Worker: `Có tin nhắn mới`
- Worker: `Có yêu cầu mới`
- Worker: `Khách đã duyệt thay đổi phạm vi`

Avoid full address, unit, phone number, customer name, worker bank data, exact location, or raw problem description in push bodies.

## Workflow Hooks

Phase 2 hooks target:

- Broadcast created for worker.
- Worker accepted job.
- Worker status changes.
- Scope change requested / decided.
- Customer/worker job chat message created.
- Worker cancellation approved and rebroadcasted.
- Job completed by worker.
- Customer confirmed completion.

## Verification Required Later

- Unit: token registration sends only safe metadata.
- Unit: push helper batches and logs failed tickets without throwing away DB state.
- Router: push route/deep link payloads remain role-safe.
- Manual device: TestFlight iPhone receives a worker/customer workflow push.
- Static: no secrets, phone numbers, unit numbers, or full addresses in push title/body templates.
- Mobile: add `expo-notifications`, request permission after authenticated role load, fetch Expo push token, and call `/notifications/device-token`.
