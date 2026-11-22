// BFF handlers for sign-in, registration and sign-out. Tokens returned by the backend are
// validated and moved into httpOnly cookies; the browser only ever learns `{ ok: true }`.
import { TokenPair } from "@/lib/contracts";
import { UpstreamError, isCrossSiteWrite, problem, requestId, upstreamProblem } from "./http";
import { REFRESH, backendAuth, clearSession, setSession, type CookieJar } from "./session";

const MAX_AUTH_BODY = 16 * 1024;

async function readJsonObject(req: Request): Promise<Record<string, unknown> | undefined> {
  const text = await req.text();
  if (text.length > MAX_AUTH_BODY) return undefined;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Relay a backend error, keeping its problem body when it has one. */
async function relayError(res: Response, rid: string): Promise<Response> {
  const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
  const extra: Record<string, string> = {};
  const retry = res.headers.get("retry-after");
  if (retry) extra["retry-after"] = retry;
  if (res.status >= 500) return problem(502, "Service unavailable", "Please try again shortly.", rid, extra);
  if (body && typeof body.title === "string") {
    return new Response(JSON.stringify(body), {
      status: res.status,
      headers: { "content-type": "application/problem+json", "x-request-id": rid, ...extra },
    });
  }
  return problem(res.status, res.statusText || "Request failed", undefined, rid, extra);
}

export async function signIn(kind: "login" | "register", req: Request, jar: CookieJar): Promise<Response> {
  const rid = requestId(req);
  if (isCrossSiteWrite(req)) return problem(403, "Cross-site request refused", undefined, rid);
  const payload = await readJsonObject(req);
  if (!payload) return problem(400, "Invalid request", "Expected a JSON object.", rid);

  let res: Response;
  try {
    res = await backendAuth(kind, payload, rid, req.signal);
  } catch (err) {
    if (err instanceof UpstreamError) return upstreamProblem(err, rid);
    throw err;
  }
  if (!res.ok) return relayError(res, rid);

  const pair = TokenPair.safeParse(await res.json().catch(() => null));
  if (!pair.success) return problem(502, "Unexpected response from server", undefined, rid);
  setSession(jar, pair.data);
  return Response.json({ ok: true }, { status: kind === "register" ? 201 : 200, headers: { "x-request-id": rid } });
}

export async function signOut(req: Request, jar: CookieJar): Promise<Response> {
  const rid = requestId(req);
  if (isCrossSiteWrite(req)) return problem(403, "Cross-site request refused", undefined, rid);
  const refresh = jar.get(REFRESH)?.value;
  // Best effort: the local session is cleared even if the backend can't revoke the token now.
  if (refresh) await backendAuth("logout", { refresh_token: refresh }, rid).catch(() => undefined);
  clearSession(jar);
  return Response.json({ ok: true }, { headers: { "x-request-id": rid } });
}
