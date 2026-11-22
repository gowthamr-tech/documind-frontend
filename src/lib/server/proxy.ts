// Authenticated pass-through to the FastAPI backend (/api/proxy/* -> /api/v1/*).
// Streams responses (SSE, images, files), rotates the access token once on 401, and turns every
// failure into a problem+json response instead of an unhandled exception.
import { serverEnv } from "./env";
import { UpstreamError, backendUrl, fetchUpstream, isCrossSiteWrite, problem, requestId, upstreamProblem } from "./http";
import { ACCESS, REFRESH, clearSession, refreshSession, setSession, type CookieJar } from "./session";

const PASS_REQ = ["content-type", "accept"];
const PASS_RES = ["content-type", "content-disposition", "cache-control", "retry-after", "ratelimit-limit",
  "ratelimit-remaining", "ratelimit-reset"];

/** Reject anything that could escape /api/v1 once the URL is normalised ("..", "."), or is empty. */
export function isSafePath(segments: string[]): boolean {
  return segments.length > 0 && segments.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes("\\"));
}

const TOO_LARGE = Symbol("too-large");

/** Buffer the request body (needed to replay it after a token refresh), enforcing a size cap. */
async function readBody(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null | typeof TOO_LARGE> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return TOO_LARGE;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  if (size === 0) return null;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function proxy(req: Request, segments: string[], jar: CookieJar): Promise<Response> {
  const rid = requestId(req);
  if (!isSafePath(segments)) return problem(400, "Invalid path", undefined, rid);
  if (isCrossSiteWrite(req)) return problem(403, "Cross-site request refused", undefined, rid);

  let body: Uint8Array<ArrayBuffer> | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const read = await readBody(req, serverEnv().maxBodyBytes);
    if (read === TOO_LARGE) return problem(413, "Request too large", "Files must be 50 MB or smaller.", rid);
    body = read;
  }

  const target = backendUrl(segments.map(encodeURIComponent).join("/")) + new URL(req.url).search;
  const forward = (token: string | undefined) => {
    const headers = new Headers({ "x-request-id": rid });
    for (const h of PASS_REQ) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetchUpstream(target, { method: req.method, headers, body, redirect: "manual" }, req.signal);
  };

  let res: Response;
  try {
    res = await forward(jar.get(ACCESS)?.value);
    if (res.status === 401) {
      const refresh = jar.get(REFRESH)?.value;
      if (refresh) {
        const r = await refreshSession(refresh, rid);
        if (r.ok) {
          setSession(jar, r.pair);
          await res.body?.cancel();
          res = await forward(r.pair.access_token);
        } else if (r.invalid) {
          clearSession(jar);
        }
      }
    }
  } catch (err) {
    if (err instanceof UpstreamError) return upstreamProblem(err, rid);
    if (req.signal.aborted) return new Response(null, { status: 499 }); // client went away
    throw err;
  }

  const headers = new Headers({ "x-request-id": res.headers.get("x-request-id") ?? rid });
  for (const h of PASS_RES) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (headers.get("content-type")?.startsWith("text/event-stream")) headers.set("x-accel-buffering", "no");
  return new Response(res.body, { status: res.status, headers });
}
