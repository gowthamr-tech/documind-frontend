import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, api, apiVoid, errorMessage, shouldRetry, toError } from "./api";

const problem = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/problem+json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("toError", () => {
  it("reads RFC 9457 problem bodies", async () => {
    const e = await toError(problem(422, { title: "Validation failed", detail: "question too short", request_id: "r1" }));
    expect(e).toMatchObject({ status: 422, title: "Validation failed", detail: "question too short", requestId: "r1" });
  });
  it("survives non-JSON bodies (e.g. a gateway HTML page)", async () => {
    const e = await toError(new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway", headers: { "x-request-id": "gw" } }));
    expect(e).toMatchObject({ status: 502, title: "Bad Gateway", requestId: "gw" });
  });
  it("ignores non-string fields", async () => {
    const e = await toError(problem(400, { title: { nested: true }, detail: 5 }));
    expect(e.title).toBe("HTTP 400");
    expect(e.detail).toBeUndefined();
  });
});

describe("api", () => {
  const Schema = z.object({ n: z.number() });

  it("returns validated data through the BFF", async () => {
    const fetchMock = vi.fn(async () => Response.json({ n: 1, extra: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/things?a=1", Schema)).resolves.toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/things?a=1", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("turns contract drift into a readable ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ n: "one" }, { headers: { "x-request-id": "r9" } })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = await api("things", Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, title: "Unexpected response from server", requestId: "r9" });
    expect((err as ApiError).detail).toContain("(at n)");
  });

  it("maps network failures to a friendly error but lets aborts through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(api("x", Schema)).rejects.toMatchObject({ status: 0, title: "Network error" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    await expect(api("x", Schema)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects invalid JSON and HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    await expect(api("x", Schema)).rejects.toMatchObject({ detail: "The response was not valid JSON." });
    vi.stubGlobal("fetch", vi.fn(async () => problem(404, { title: "Not found" })));
    await expect(api("x", Schema)).rejects.toMatchObject({ status: 404, title: "Not found" });
  });

  it("apiVoid accepts 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(apiVoid("documents/1", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

describe("helpers", () => {
  it("retries only transient failures, at most twice", () => {
    expect(shouldRetry(0, new ApiError(503, "down"))).toBe(true);
    expect(shouldRetry(0, new ApiError(429, "slow down"))).toBe(true);
    expect(shouldRetry(0, new ApiError(0, "Network error"))).toBe(true);
    expect(shouldRetry(0, new ApiError(0, "Unexpected response from server"))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, "auth"))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, "missing"))).toBe(false);
    expect(shouldRetry(2, new ApiError(503, "down"))).toBe(false);
  });
  it("formats any thrown value", () => {
    expect(errorMessage(new ApiError(400, "Bad", "detail"))).toBe("detail");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("weird")).toBe("Something went wrong.");
  });
});
