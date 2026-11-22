import { describe, expect, it } from "vitest";
import { BAD_ANSWER, INCOMPLETE, MALFORMED, STOPPED, applyEvent, finishTurn, newTurn, type Turn } from "./ask";
import { answer } from "@/test/fixtures";
import type { SseEvent } from "./sse";

const ev = (event: string, data: unknown): SseEvent => ({ event, data: typeof data === "string" ? data : JSON.stringify(data) });

function run(events: SseEvent[], start: Turn = newTurn("q")) {
  let turn = start;
  let conversationId: string | undefined;
  for (const e of events) {
    const r = applyEvent(turn, e);
    turn = r.turn;
    conversationId = r.conversationId ?? conversationId;
  }
  return { turn, conversationId };
}

describe("applyEvent", () => {
  it("follows the happy path: run, steps, deltas, verified final", () => {
    const { turn, conversationId } = run([
      ev("run", { run_id: "r", conversation_id: "c1" }),
      ev("agent_step", { node: "retrieve", ms: 12 }),
      ev("answer_delta", { text: "Revenue " }),
      ev("answer_delta", { text: "grew" }),
      ev("final", answer),
    ]);
    expect(conversationId).toBe("c1");
    expect(turn.state).toBe("done");
    expect(turn.steps).toEqual([{ node: "retrieve", ms: 12 }]);
    expect(turn.partial).toBe("Revenue grew");
    expect(turn.answer?.verification_summary).toBe("verified");
  });

  it("never displays a final answer that fails the contract", () => {
    expect(run([ev("final", {})]).turn).toMatchObject({ state: "failed", error: BAD_ANSWER });
  });

  it("handles approval gates", () => {
    const { turn } = run([ev("approval_required", { status: "awaiting_approval", approval_id: "a1", run_id: "r1", payload: {} })]);
    expect(turn).toMatchObject({ state: "awaiting_approval", pending: { approval_id: "a1" } });
  });

  it("surfaces server errors from the stream", () => {
    expect(run([ev("error", { title: "Rate limited", status: 429, detail: "Slow down" })]).turn.error).toBe("Slow down");
    expect(run([ev("error", { title: "Boom", detail: null })]).turn.error).toBe("Boom");
    expect(run([ev("error", "garbage")]).turn.error).toBe("The question could not be answered.");
  });

  it("does not crash on malformed JSON", () => {
    expect(run([ev("run", "{not json")]).turn).toMatchObject({ state: "failed", error: MALFORMED });
    expect(run([ev("agent_step", "{oops"), ev("answer_delta", "[1]")]).turn).toMatchObject({ state: "streaming", steps: [], partial: "" });
  });

  it("ignores unknown events and anything after the turn settled", () => {
    const { turn } = run([ev("heartbeat", {}), ev("final", answer), ev("error", { title: "late" }), ev("answer_delta", { text: "x" })]);
    expect(turn.state).toBe("done");
    expect(turn.error).toBeUndefined();
  });
});

describe("finishTurn", () => {
  it("flags streams that ended without a terminal event", () => {
    expect(finishTurn(newTurn("q"))).toMatchObject({ state: "failed", error: INCOMPLETE });
  });
  it("distinguishes user stops from failures", () => {
    expect(finishTurn(newTurn("q"), { aborted: true })).toMatchObject({ state: "stopped", error: STOPPED });
    expect(finishTurn(newTurn("q"), { error: "Network error" })).toMatchObject({ state: "failed", error: "Network error" });
  });
  it("leaves settled turns alone", () => {
    const done = run([ev("final", answer)]).turn;
    expect(finishTurn(done, { aborted: true })).toBe(done);
  });
});
