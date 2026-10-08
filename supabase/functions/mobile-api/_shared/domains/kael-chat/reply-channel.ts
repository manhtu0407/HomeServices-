export type KaelChatReply = {
  readonly turnId: string;
  readonly text: string;
};

type KaelChatReplyListener = (reply: KaelChatReply) => void;

const replyListeners = new Map<string, Set<KaelChatReplyListener>>();

// A Work turn's reply is the guarded text already written to kael_chat_turns. An open stream in
// this isolate hears it the moment the row exists, while the session update, re-read and preview
// signing still run, so the customer reads exactly the text that will be in the stored turn.
export function subscribeKaelChatReply(
  sessionId: string,
  listener: KaelChatReplyListener,
): () => void {
  const listeners = replyListeners.get(sessionId) ?? new Set<KaelChatReplyListener>();
  listeners.add(listener);
  replyListeners.set(sessionId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) replyListeners.delete(sessionId);
  };
}

export function publishKaelChatReply(sessionId: string, reply: KaelChatReply) {
  const listeners = replyListeners.get(sessionId);
  if (!listeners || !reply.turnId || !reply.text.trim()) return;
  for (const listener of [...listeners]) {
    try {
      listener(reply);
    } catch {
      console.warn("Kael chat reply listener threw", { sessionId });
    }
  }
}
