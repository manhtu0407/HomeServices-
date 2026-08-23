// Edge service notifications domain facade. Notification responsibilities are split by caller shape.

export {
  acknowledgeMatchingPushDelivery,
  listNotifications,
  markNotificationRead,
  registerDevicePushToken,
  unregisterDevicePushToken,
} from "./notifications-inbox.ts";
export {
  notifyBroadcastWorkers,
  notifyCustomerJobStatus,
  notifyCustomerWorkerCheckedIn,
  notifyCustomerWorkerMatched,
  notifyJobMessageRecipient,
  notifyKaelConfirmedCompletion,
} from "./notifications-job.ts";
export {
  insertUserNotification,
  notifyCustomerScopeChangeRequested,
  notifyCustomerWorkerReplacementSearch,
  notifyWorkerCustomerCancellation,
  notifyWorkerScopeDecision,
} from "./notifications-events.ts";
