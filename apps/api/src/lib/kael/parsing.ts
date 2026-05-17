export function safeParseJSON(text: string): unknown {
  try {
    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
}
