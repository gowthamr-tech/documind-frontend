import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut } from "./auth";
import { parseEnv, resetServerEnv } from "./env";
import { fakeJar, stubBackend, tokens } from "@/test/server";
import { ACCESS, REFRESH } from "./session";

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000/api/auth/${path}`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  vi.stubEnv("DOCUMIND_API_URL", "http://backend.test");
  resetServerEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("signIn", () => {
  it("stores validated tokens in httpOnly cookies and never returns them", async () => {
    const backend = stubBackend(() => Response.json(tokens(1)));
    const jar = fakeJar();
    const res = await signIn("register", post("register", '{"email":"a@b.co","password":"x","org_name":"Acme"}'), jar);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('{"ok":true}');
    expect(jar.store.get(ACCESS)).toBe("access-1");
    expect(jar.options.get(ACCESS)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
    expect(backend.mock.calls[0]![0]).toBe("http://backend.test/api/v1/auth/register");
  });

  it("rejects bodies that are not JSON objects without calling the backend", async () => {
    const backend = stubBackend(() => Response.json(tokens(1)));
    for (const body of ["not json", "[1,2]", "null", "x".repeat(20_000)]) {
      expect((await signIn("login", post("login", body), fakeJar())).status).toBe(400);
    }
    expect(backend).not.toHaveBeenCalled();
  });

  it("relays backend problems (bad credentials, rate limits) as-is", async () => {
    stubBackend(() => Response.json({ title: "Invalid email or password", status: 401 }, { status: 401 }));
    const res = await signIn("login", post("login", "{}"), fakeJar());
    expect(res.status).toBe(401);
    expect(((await res.json()) as { title: string }).title).toBe("Invalid email or password");

    stubBackend(() => Response.json({ title: "Too many requests" }, { status: 429, headers: { "retry-after": "30" } }));
    const limited = await signIn("login", post("login", "{}"), fakeJar());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("30");
  });

  it("hides backend crashes and malformed token payloads behind 502", async () => {
    stubBackend(() => new Response("Traceback ...", { status: 500 }));
    expect((await signIn("login", post("login", "{}"), fakeJar())).status).toBe(502);
    const jar = fakeJar();
    stubBackend(() => Response.json({ access_token: "a" }));
    expect((await signIn("login", post("login", "{}"), jar)).status).toBe(502);
    expect(jar.store.size).toBe(0);
    stubBackend(() => { throw new TypeError("fetch failed"); });
    expect((await signIn("login", post("login", "{}"), fakeJar())).status).toBe(502);
  });

  it("refuses cross-site sign-in (login CSRF)", async () => {
    const backend = stubBackend(() => Response.json(tokens(1)));
    const res = await signIn("login", post("login", "{}", { "sec-fetch-site": "cross-site" }), fakeJar());
    expect(res.status).toBe(403);
    expect(backend).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("clears cookies even when the backend is down", async () => {
    stubBackend(() => { throw new TypeError("fetch failed"); });
    const jar = fakeJar({ [ACCESS]: "a", [REFRESH]: "r" });
    expect((await signOut(post("logout", ""), jar)).status).toBe(200);
    expect(jar.store.size).toBe(0);
  });
});

describe("server env", () => {
  it("applies defaults for local development", () => {
    expect(parseEnv({})).toEqual({ production: false, apiUrl: "http://localhost:8000", upstreamTimeoutMs: 30_000, maxBodyBytes: 51 * 1024 * 1024 });
  });
  it("normalises the API URL and coerces numbers", () => {
    expect(parseEnv({ DOCUMIND_API_URL: "https://api.example.com//", DOCUMIND_UPSTREAM_TIMEOUT_MS: "5000" }))
      .toMatchObject({ apiUrl: "https://api.example.com", upstreamTimeoutMs: 5000 });
  });
  it("fails loudly on misconfiguration", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/DOCUMIND_API_URL: is required in production/);
    expect(() => parseEnv({ DOCUMIND_API_URL: "ftp://x" })).toThrow(/DOCUMIND_API_URL/);
    expect(() => parseEnv({ DOCUMIND_UPSTREAM_TIMEOUT_MS: "fast" })).toThrow(/DOCUMIND_UPSTREAM_TIMEOUT_MS/);
  });
});
