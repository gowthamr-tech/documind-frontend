// Test doubles for the BFF: an in-memory cookie jar and a scripted backend.
import { vi } from "vitest";
import type { CookieJar } from "@/lib/server/session";

export function fakeJar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const jar: CookieJar & { store: Map<string, string>; options: Map<string, unknown> } = {
    store,
    options: new Map(),
    get: (name) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set(name, value, options) {
      store.set(name, value);
      this.options.set(name, options);
    },
    delete: ({ name }) => store.delete(name),
  };
  return jar;
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Stub global fetch; the handler sees backend URLs. Returns the mock for call assertions. */
export function stubBackend(handler: Handler) {
  const mock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => handler(String(input), init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

export const tokens = (n: number) => ({
  access_token: `access-${n}`, refresh_token: `refresh-${n}-xxxxxxxxxxxxxxxxxxxx`, token_type: "bearer", expires_in: 900,
});

export const authHeader = (init: RequestInit) => new Headers(init.headers).get("authorization");
