// Browser-side API client. All calls go through the Next.js BFF (/api/proxy/*), which holds the
// session in httpOnly cookies — this code never sees a token.
//
// Every failure mode becomes an ApiError with a human-readable title:
//   network failure -> status 0 · HTTP error -> RFC 9457 problem body · contract drift -> status 0
import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly requestId?: string,
  ) {
    super(detail ?? title);
    this.name = "ApiError";
  }
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);

/** URL of a backend resource behind the BFF (also used for <img src> and downloads). */
export const fileUrl = (path: string) => `/api/proxy/${path.replace(/^\/+/, "")}`;

/** Parse a problem+json (or any) error response into an ApiError; never throws. */
export async function toError(res: Response): Promise<ApiError> {
  const requestId = res.headers.get("x-request-id") ?? undefined;
  const fallback = res.statusText || `HTTP ${res.status}`;
  try {
    const p = (await res.json()) as { title?: unknown; detail?: unknown; request_id?: unknown };
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return new ApiError(res.status, str(p.title) ?? fallback, str(p.detail), str(p.request_id) ?? requestId);
  } catch {
    return new ApiError(res.status, fallback, undefined, requestId);
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) return;
  // Full reload on purpose: runs outside React (no router) and discards in-memory data of the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
}

export const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/** fetch() through the BFF; resolves only for 2xx responses. Abort errors pass through untouched. */
export async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(fileUrl(path), { ...init, credentials: "same-origin" });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiError(0, "Network error", "Could not reach the server. Check your connection and try again.");
  }
  if (res.status === 401) redirectToLogin();
  if (!res.ok) throw await toError(res);
  return res;
}

/** Validate a payload against a contract schema, turning drift into a readable ApiError. */
export function parseContract<S extends z.ZodType>(schema: S, body: unknown, what: string, requestId?: string): z.output<S> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
  if (process.env.NODE_ENV !== "production") console.error(`Contract violation for ${what}`, parsed.error.issues);
  throw new ApiError(0, "Unexpected response from server",
    `The response for ${what} did not match the expected format${where}.`, requestId);
}

/** Request JSON and validate it against the contract schema. */
export async function api<S extends z.ZodType>(path: string, schema: S, init?: RequestInit): Promise<z.output<S>> {
  const res = await send(path, init);
  const requestId = res.headers.get("x-request-id") ?? undefined;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(0, "Unexpected response from server", "The response was not valid JSON.", requestId);
  }
  return parseContract(schema, body, path.split("?")[0] ?? path, requestId);
}

/** For endpoints that answer 204 No Content (e.g. DELETE). */
export async function apiVoid(path: string, init?: RequestInit): Promise<void> {
  await send(path, init);
}

export const jsonBody = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Turn anything thrown into a message suitable for display. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail ?? err.title;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

/** React Query retry policy: retry only what can succeed on retry (network, 5xx, 429) — never other 4xx. */
export function shouldRetry(failures: number, err: unknown): boolean {
  if (failures >= 2) return false;
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 ? err.title === "Network error" : err.status >= 500 || err.status === 429;
}
