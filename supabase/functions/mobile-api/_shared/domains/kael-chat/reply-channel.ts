export type KaelChatReply = {
  readonly turnId: string;
  readonly text: string;
};

type KaelChatReplyListener = (reply: KaelChatReply) => void;

type SessionReplyListeners = { listeners: Set<KaelChatReplyListener>; contended: boolean };

const replyListeners = new Map<string, SessionReplyListeners>();

// A Work turn's reply is the guarded text already written to kael_chat_turns. An open stream in
// this isolate hears it the moment the row exists, while the session update, re-read and preview
// signing still run, so the customer reads exactly the text that will be in the stored turn.
// A reply carries only its session, so two streams open on one session (a second device, a retry)
// cannot tell whose reply it is: once they overlap, neither streams a reply and both fall back to
// the stored turn in their result, until every stream on that session has closed.
export function subscribeKaelChatReply(
  sessionId: string,
  listener: KaelChatReplyListener,
): () => void {
  const entry = replyListeners.get(sessionId) ?? { listeners: new Set<KaelChatReplyListener>(), contended: false };
  if (entry.listeners.size > 0) entry.contended = true;
  entry.listeners.add(listener);
  replyListeners.set(sessionId, entry);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0 && replyListeners.get(sessionId) === entry) replyListeners.delete(sessionId);
  };
}

export function publishKaelChatReply(sessionId: string, reply: KaelChatReply) {
  const entry = replyListeners.get(sessionId);
  if (!entry || entry.contended || !reply.turnId || !reply.text.trim()) return;
  for (const listener of [...entry.listeners]) {
    try {
      listener(reply);
    } catch {
      console.warn("Kael chat reply listener threw", { sessionId });
    }
  }
}
