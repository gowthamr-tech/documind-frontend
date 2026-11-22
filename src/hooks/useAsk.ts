"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isAbort } from "@/lib/api";
import { applyEvent, finishTurn, newTurn, type Turn } from "@/lib/ask";
import { postSse } from "@/lib/sse";

export type { Step, Turn } from "@/lib/ask";

/** Streams questions through /query (or /query/compare) and accumulates a conversation. */
export function useAsk(endpoint: "query" | "query/compare") {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const conversation = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Never leave a request (and its LLM spend) running after the page is gone.
  useEffect(() => () => abort.current?.abort(), []);

  const patchLast = (fn: (t: Turn) => Turn) =>
    setTurns((ts) => (ts.length ? [...ts.slice(0, -1), fn(ts[ts.length - 1]!)] : ts));

  const ask = useCallback(async (question: string, documentIds: string[]) => {
    if (abort.current) return; // one question at a time
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setTurns((ts) => [...ts, newTurn(question)]);
    const body = { question, document_ids: documentIds, conversation_id: conversation.current, stream: true };
    try {
      await postSse(endpoint, body, (e) => {
        setTurns((ts) => {
          const last = ts[ts.length - 1];
          if (!last) return ts;
          const { turn, conversationId } = applyEvent(last, e);
          if (conversationId) conversation.current = conversationId;
          return turn === last ? ts : [...ts.slice(0, -1), turn];
        });
      }, controller.signal);
      patchLast((t) => finishTurn(t));
    } catch (err) {
      patchLast((t) => finishTurn(t, isAbort(err) ? { aborted: true } : { error: errorMessage(err) }));
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }, [endpoint]);

  const stop = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => {
    abort.current?.abort();
    conversation.current = null;
    setTurns([]);
  }, []);

  return { turns, busy, ask, reset, stop };
}
