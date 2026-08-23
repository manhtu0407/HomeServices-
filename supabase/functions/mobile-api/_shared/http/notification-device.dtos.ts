export type EdgeDevicePushTokenUnregisterResponse = {
  token_id: string | null;
  unregistered: boolean;
  updated_at: string;
};

export type EdgeMatchingPushDeliveryAckResponse = {
  acknowledged: true;
  delivery_id: string;
  delivered_at: string;
};
