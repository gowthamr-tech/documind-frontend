// Minimal, spec-conformant Server-Sent Events parser for fetch() streams (EventSource can't POST).
import { jsonBody, send } from "./api";

export interface SseEvent { event: string; data: string }

export function createSseParser(onEvent: (e: SseEvent) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk.replace(/\r\n?/g, "\n");
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue;
        const [field, ...rest] = line.split(":");
        const value = rest.join(":").replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) onEvent({ event, data: data.join("\n") });
    }
  };
}

/** POST a JSON body and feed the SSE response to `onEvent` until the server closes the stream. */
export async function postSse(path: string, body: unknown, onEvent: (e: SseEvent) => void, signal?: AbortSignal) {
  const init = jsonBody(body);
  const res = await send(path, { ...init, headers: { ...init.headers, accept: "text/event-stream" }, signal });
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const feed = createSseParser(onEvent);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      feed(value);
    }
  } finally {
    reader.releaseLock();
  }
}
