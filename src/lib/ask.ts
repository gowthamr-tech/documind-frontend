// Pure state machine for one streamed question (POST /query with stream: true).
// The backend emits: run, agent_step*, then (answer_delta* + final) | approval_required | error.
// Keeping this free of React makes every edge case unit-testable.
import { z } from "zod";
import { Answer, PendingApproval } from "./contracts";
import type { SseEvent } from "./sse";

export interface Step { node: string; [k: string]: unknown }

export type TurnState = "streaming" | "done" | "awaiting_approval" | "failed" | "stopped";

export interface Turn {
  question: string;
  state: TurnState;
  steps: Step[];
  partial: string;
  answer?: Answer;
  pending?: PendingApproval;
  error?: string;
}

const RunEvent = z.object({ conversation_id: z.string().min(1) });
const StepEvent = z.object({ node: z.string() }).loose();
const DeltaEvent = z.object({ text: z.string() });
const ErrorEvent = z.object({ title: z.string().optional(), detail: z.string().nullish() });

export const MALFORMED = "The server sent a response that could not be read. Please try again.";
export const BAD_ANSWER = "The answer could not be displayed because it did not match the expected format.";
export const INCOMPLETE = "The connection closed before the answer was complete. Please try again.";
export const STOPPED = "Stopped before the answer was complete.";

export const newTurn = (question: string): Turn => ({ question, state: "streaming", steps: [], partial: "" });

const fail = (t: Turn, error: string): Turn => ({ ...t, state: "failed", error });

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/**
 * Apply one SSE event to the current turn. Returns the next turn and, for the `run` event, the
 * conversation id to continue with. Unknown event names are ignored (forward compatible); events
 * that arrive after the turn has settled are ignored too.
 */
export function applyEvent(turn: Turn, e: SseEvent): { turn: Turn; conversationId?: string } {
  if (turn.state !== "streaming") return { turn };
  const data = parseJson(e.data);
  switch (e.event) {
    case "run": {
      const r = RunEvent.safeParse(data);
      return r.success ? { turn, conversationId: r.data.conversation_id } : { turn: fail(turn, MALFORMED) };
    }
    case "agent_step": {
      const r = StepEvent.safeParse(data);
      return { turn: r.success ? { ...turn, steps: [...turn.steps, r.data] } : turn }; // progress only
    }
    case "answer_delta": {
      const r = DeltaEvent.safeParse(data);
      return { turn: r.success ? { ...turn, partial: turn.partial + r.data.text } : turn };
    }
    case "final": {
      const r = Answer.safeParse(data);
      return { turn: r.success ? { ...turn, state: "done", answer: r.data } : fail(turn, BAD_ANSWER) };
    }
    case "approval_required": {
      const r = PendingApproval.safeParse(data);
      return { turn: r.success ? { ...turn, state: "awaiting_approval", pending: r.data } : fail(turn, MALFORMED) };
    }
    case "error": {
      const r = ErrorEvent.safeParse(data);
      const msg = r.success ? (r.data.detail ?? r.data.title) : undefined;
      return { turn: fail(turn, msg || "The question could not be answered.") };
    }
    default:
      return { turn };
  }
}

/** Settle a turn whose stream ended (normally, by abort, or with an exception). */
export function finishTurn(turn: Turn, outcome: { aborted?: boolean; error?: string } = {}): Turn {
  if (turn.state !== "streaming") return turn;
  if (outcome.aborted) return { ...turn, state: "stopped", error: STOPPED };
  return fail(turn, outcome.error ?? INCOMPLETE);
}
