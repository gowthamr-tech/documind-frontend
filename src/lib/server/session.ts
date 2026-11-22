// Server-only session helpers for the BFF: tokens live in httpOnly cookies, never in browser JS.
// Functions take the cookie jar explicitly (Next's `await cookies()` in production, a fake in tests).
import { TokenPair } from "@/lib/contracts";
import { serverEnv } from "./env";
import { backendUrl, fetchUpstream } from "./http";

export const ACCESS = "dm_access";
export const REFRESH = "dm_refresh";
const REFRESH_MAX_AGE = 14 * 24 * 3600;

interface CookieOptions { httpOnly: boolean; sameSite: "lax" | "strict"; secure: boolean; path: string; maxAge: number }
export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(options: { name: string; path: string }): unknown;
}

export function setSession(jar: CookieJar, t: TokenPair): void {
  const secure = serverEnv().production;
  jar.set(ACCESS, t.access_token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: t.expires_in });
  jar.set(REFRESH, t.refresh_token, { httpOnly: true, sameSite: "strict", secure, path: "/api", maxAge: REFRESH_MAX_AGE });
}

export function clearSession(jar: CookieJar): void {
  jar.delete({ name: ACCESS, path: "/" });
  jar.delete({ name: REFRESH, path: "/api" });
}

export function backendAuth(path: "login" | "register" | "refresh" | "logout", body: unknown, rid?: string, signal?: AbortSignal) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (rid) headers["x-request-id"] = rid;
  return fetchUpstream(backendUrl(`auth/${path}`), { method: "POST", headers, body: JSON.stringify(body) }, signal);
}

// --- refresh-token rotation ---------------------------------------------------------------------
// The backend rotates refresh tokens and treats reuse of an old one as theft (it revokes the
// session). When several requests hit an expired access token at once, they must share ONE
// refresh call, and requests that still carry the old cookie shortly afterwards must reuse its
// result instead of presenting the already-rotated token again.

export type RefreshResult = { ok: true; pair: TokenPair } | { ok: false; invalid: boolean };

const REUSE_WINDOW_MS = 30_000;
const inflight = new Map<string, { at: number; result: Promise<RefreshResult> }>();

async function doRefresh(token: string, rid?: string): Promise<RefreshResult> {
  try {
    const res = await backendAuth("refresh", { refresh_token: token }, rid);
    if (!res.ok) {
      // 4xx (except rate limiting) = token rejected; 5xx = backend trouble, keep the session.
      return { ok: false, invalid: res.status >= 400 && res.status < 500 && res.status !== 429 };
    }
    const pair = TokenPair.safeParse(await res.json().catch(() => null));
    return pair.success ? { ok: true, pair: pair.data } : { ok: false, invalid: false };
  } catch {
    return { ok: false, invalid: false };
  }
}

export function refreshSession(token: string, rid?: string): Promise<RefreshResult> {
  const now = Date.now();
  for (const [k, v] of inflight) if (now - v.at > REUSE_WINDOW_MS) inflight.delete(k);
  const hit = inflight.get(token);
  if (hit) return hit.result;
  const result = doRefresh(token, rid);
  inflight.set(token, { at: now, result });
  // Transient failures must not be cached: the next request should try again.
  void result.then((r) => {
    if (!r.ok && !r.invalid) inflight.delete(token);
  });
  return result;
}

/** Test hook. */
export function resetRefreshCache(): void {
  inflight.clear();
}
