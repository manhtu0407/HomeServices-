export function stringFromUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringFromUnknown(item)).filter((item): item is string => Boolean(item))
    : []
}

export function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  return stringFromUnknown(metadata?.[key])
}
