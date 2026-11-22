// Shared plumbing for BFF route handlers: request IDs, RFC 9457 problem responses, and a fetch to
// the backend that distinguishes "backend down" / "backend slow" from client disconnects.
import { serverEnv } from "./env";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/; // same rule as the backend middleware

export function requestId(req: Request): string {
  const incoming = req.headers.get("x-request-id");
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}

export function problem(status: number, title: string, detail?: string, rid?: string, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/problem+json");
  if (rid) headers.set("x-request-id", rid);
  return new Response(JSON.stringify({ type: "about:blank", title, status, detail, request_id: rid }), { status, headers });
}

/** Browsers mark cross-site requests; refuse them for state-changing methods (defence in depth). */
export function isCrossSiteWrite(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return false;
  return req.headers.get("sec-fetch-site") === "cross-site";
}

export class UpstreamError extends Error {
  constructor(public readonly kind: "timeout" | "unreachable") {
    super(kind === "timeout" ? "Backend timed out" : "Backend unreachable");
    this.name = "UpstreamError";
  }
}

export function upstreamProblem(err: UpstreamError, rid: string): Response {
  return err.kind === "timeout"
    ? problem(504, "The server took too long to respond", "Please try again in a moment.", rid)
    : problem(502, "Service unavailable", "The document service could not be reached. Please try again shortly.", rid);
}

/**
 * fetch() the backend. The timeout covers only the wait for response headers, so long SSE streams
 * are not cut off; `signal` (the browser's request) cancels the upstream call at any point.
 */
export async function fetchUpstream(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, serverEnv().upstreamTimeoutMs);
  const onClientAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onClientAbort, { once: true });
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } catch (err) {
    signal?.removeEventListener("abort", onClientAbort);
    if (timedOut) throw new UpstreamError("timeout");
    if (signal?.aborted) throw err;
    throw new UpstreamError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

export const backendUrl = (path: string) => `${serverEnv().apiUrl}/api/v1/${path.replace(/^\/+/, "")}`;
