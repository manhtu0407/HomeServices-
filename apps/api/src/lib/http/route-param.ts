const UUID_ROUTE_PARAM_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidRouteParam(value: string): boolean {
  return UUID_ROUTE_PARAM_PATTERN.test(value)
}
