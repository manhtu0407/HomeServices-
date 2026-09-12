export function matchStagingPaymentRoute(
  _action: string,
  _method: string,
  _jobId: string,
): null {
  // Synthetic settlement is service-role-only; no authenticated mobile actor owns this route.
  return null;
}
