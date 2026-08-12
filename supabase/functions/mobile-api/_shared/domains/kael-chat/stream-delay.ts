/** Keeps an SSE connection alive while polling durable Kael workflow state. */
export function waitForKaelChatProgressPoll(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
