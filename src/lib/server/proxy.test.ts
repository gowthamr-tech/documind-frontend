import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnv } from "./env";
import { isSafePath, proxy } from "./proxy";
import { authHeader, fakeJar, stubBackend, tokens } from "@/test/server";
import { ACCESS, REFRESH, resetRefreshCache } from "./session";

const API = "http://backend.test";
const req = (path: string, init: RequestInit = {}) => new Request(`http://localhost:3000/api/proxy/${path}`, init);
const segs = (path: string) => path.split("?")[0]!.split("/");

beforeEach(() => {
  vi.stubEnv("DOCUMIND_API_URL", API);
  vi.stubEnv("DOCUMIND_UPSTREAM_TIMEOUT_MS", "1000");
  vi.stubEnv("DOCUMIND_MAX_BODY_BYTES", "1024");
  resetServerEnv();
  resetRefreshCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("path safety", () => {
  it("rejects traversal out of /api/v1", async () => {
    expect(isSafePath(["documents", "1"])).toBe(true);
    for (const bad of [[], [""], [".."], ["documents", ".."], ["."], ["a\\b"]]) expect(isSafePath(bad)).toBe(false);
    const backend = stubBackend(() => Response.json({}));
    const res = await proxy(req("x"), ["..", "..", "openapi.json"], fakeJar());
    expect(res.status).toBe(400);
    expect(backend).not.toHaveBeenCalled();
  });

  it("encodes segments and keeps the query string", async () => {
    const backend = stubBackend(() => Response.json([]));
    await proxy(req("documents/a%2Fb/tables?page=2"), ["documents", "a/b", "tables"], fakeJar());
    expect(backend.mock.calls[0]![0]).toBe(`${API}/api/v1/documents/a%2Fb/tables?page=2`);
  });
});

describe("forwarding", () => {
  it("adds the bearer token and a request id, and passes only safe headers", async () => {
    const backend = stubBackend(() => new Response("{}", {
      headers: { "content-type": "application/json", "set-cookie": "evil=1", "x-request-id": "up-1", "retry-after": "3" },
    }));
    const res = await proxy(req("auth/me", { headers: { cookie: "dm_access=t", "x-request-id": "rid-1", "x-forwarded-for": "1.2.3.4" } }),
      ["auth", "me"], fakeJar({ [ACCESS]: "tok" }));
    const sent = new Headers(backend.mock.calls[0]![1]!.headers);
    expect(sent.get("authorization")).toBe("Bearer tok");
    expect(sent.get("x-request-id")).toBe("rid-1");
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("x-forwarded-for")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-request-id")).toBe("up-1");
    expect(res.headers.get("retry-after")).toBe("3");
  });

  it("marks SSE responses as unbuffered", async () => {
    stubBackend(() => new Response("event: run\ndata: {}\n\n", { headers: { "content-type": "text/event-stream" } }));
    const res = await proxy(req("query", { method: "POST", body: "{}" }), ["query"], fakeJar());
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(await res.text()).toContain("event: run");
  });

  it("refuses oversized bodies before contacting the backend", async () => {
    const backend = stubBackend(() => Response.json({}));
    const res = await proxy(req("documents/upload", { method: "POST", body: "x".repeat(2048) }), ["documents", "upload"], fakeJar());
    expect(res.status).toBe(413);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(backend).not.toHaveBeenCalled();
  });

  it("refuses cross-site writes", async () => {
    const backend = stubBackend(() => Response.json({}));
    const res = await proxy(req("documents/1", { method: "DELETE", headers: { "sec-fetch-site": "cross-site" } }), ["documents", "1"], fakeJar());
    expect(res.status).toBe(403);
    expect(backend).not.toHaveBeenCalled();
    const ok = await proxy(req("documents", { headers: { "sec-fetch-site": "cross-site" } }), ["documents"], fakeJar());
    expect(ok.status).toBe(200); // reads (e.g. <img> from another tab) are unaffected
  });
});

describe("backend failures become problem+json", () => {
  it("502 when the backend is unreachable", async () => {
    stubBackend(() => { throw new TypeError("fetch failed"); });
    const res = await proxy(req("documents"), ["documents"], fakeJar());
    expect(res.status).toBe(502);
    const body = (await res.json()) as { title: string; request_id: string };
    expect(body.title).toBe("Service unavailable");
    expect(body.request_id).toBe(res.headers.get("x-request-id"));
  });

  it("504 when the backend does not answer in time", async () => {
    vi.useFakeTimers();
    stubBackend((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const pending = proxy(req("documents"), ["documents"], fakeJar());
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(504);
  });
});

describe("token refresh", () => {
  it("refreshes once on 401, stores the new pair and replays the request (with its body)", async () => {
    const jar = fakeJar({ [ACCESS]: "expired", [REFRESH]: "refresh-0" });
    const backend = stubBackend((url, init) => {
      if (url.endsWith("/auth/refresh")) return Response.json(tokens(1));
      return authHeader(init) === "Bearer access-1" ? Response.json({ ok: init.body ? "with-body" : "no-body" }) : new Response(null, { status: 401 });
    });
    const res = await proxy(req("search", { method: "POST", body: '{"query":"rev"}', headers: { "content-type": "application/json" } }), ["search"], jar);
    expect(await res.json()).toEqual({ ok: "with-body" });
    expect(jar.store.get(ACCESS)).toBe("access-1");
    expect(jar.store.get(REFRESH)).toBe(tokens(1).refresh_token);
    expect(jar.options.get(REFRESH)).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api" });
    expect(backend).toHaveBeenCalledTimes(3);
  });

  it("shares one refresh between concurrent requests (backend treats token reuse as theft)", async () => {
    let refreshes = 0;
    stubBackend(async (url, init) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 5));
        return Response.json(tokens(1));
      }
      return authHeader(init) === "Bearer access-1" ? Response.json({}) : new Response(null, { status: 401 });
    });
    const cookies = { [ACCESS]: "expired", [REFRESH]: "refresh-0" };
    const results = await Promise.all(
      ["documents", "auth/me", "query/runs", "processing/history"].map((p) => proxy(req(p), segs(p), fakeJar(cookies))),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(refreshes).toBe(1);
    // a straggler that still carries the old cookie reuses the result instead of re-presenting it
    await proxy(req("documents"), ["documents"], fakeJar(cookies));
    expect(refreshes).toBe(1);
  });

  it("signs out when the refresh token is rejected", async () => {
    const jar = fakeJar({ [ACCESS]: "expired", [REFRESH]: "stolen" });
    stubBackend((url) => (url.endsWith("/auth/refresh") ? Response.json({ title: "reuse detected" }, { status: 401 }) : new Response(null, { status: 401 })));
    const res = await proxy(req("documents"), ["documents"], jar);
    expect(res.status).toBe(401);
    expect(jar.store.size).toBe(0);
  });

  it("keeps the session when the refresh fails for transient reasons, and retries next time", async () => {
    const jar = fakeJar({ [ACCESS]: "expired", [REFRESH]: "refresh-0" });
    let refreshCalls = 0;
    stubBackend((url) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        return new Response("upstream error", { status: 503 });
      }
      return new Response(null, { status: 401 });
    });
    await proxy(req("documents"), ["documents"], jar);
    await proxy(req("documents"), ["documents"], jar);
    expect(jar.store.get(REFRESH)).toBe("refresh-0");
    expect(refreshCalls).toBe(2);
  });
});
