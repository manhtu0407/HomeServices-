type RealtimeSocket = Pick<WebSocket, "addEventListener" | "removeEventListener" | "send" | "close">;

export async function readRealtimeEvidence(input: {
  supabaseUrl: string;
  anonKey: string;
  createSocket?: (url: string) => RealtimeSocket;
  timeoutMs?: number;
}): Promise<{ status: number | null }> {
  let url: URL;
  try {
    url = new URL(input.supabaseUrl);
  } catch {
    return { status: null };
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!input.anonKey || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(local ? url.protocol === "http:" : url.protocol === "https:" && /^[a-z0-9]{8,40}\.supabase\.co$/u.test(url.hostname) && !url.port)) {
    return { status: null };
  }
  url.protocol = local ? "ws:" : "wss:";
  url.pathname = "/realtime/v1/websocket";
  url.searchParams.set("apikey", input.anonKey);
  url.searchParams.set("vsn", "1.0.0");
  return await new Promise((resolve) => {
    let socket: RealtimeSocket | undefined;
    let settled = false;
    const reference = "system-monitor-readonly";
    const finish = (status: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onFailure);
        socket.removeEventListener("close", onFailure);
        try { socket.close(); } catch { /* A failed transport may already be closed. */ }
      }
      resolve({ status });
    };
    const onOpen = () => {
      try { socket?.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: reference })); }
      catch { finish(503); }
    };
    const onFailure = () => finish(503);
    const onMessage = (event: Event) => {
      const data = (event as MessageEvent).data;
      if (typeof data !== "string" || data.length > 1024) { finish(503); return; }
      try {
        const message = JSON.parse(data);
        if (message.topic === "phoenix" && message.event === "phx_reply" && message.ref === reference) {
          finish(message.payload?.status === "ok" ? 200 : 503);
        }
      } catch { finish(503); }
    };
    const timer = setTimeout(() => finish(504), Math.min(5000, Math.max(1, input.timeoutMs ?? 5000)));
    try {
      socket = (input.createSocket ?? ((target) => new WebSocket(target)))(url.toString());
      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onFailure);
      socket.addEventListener("close", onFailure);
    } catch { finish(503); }
  });
}
