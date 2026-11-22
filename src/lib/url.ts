// Helpers for values that arrive via the URL and must not be trusted.

/**
 * Post-login redirect target. Only same-origin, path-absolute URLs are allowed: "//evil.com",
 * "/\\evil.com" (browsers treat "\" as "/"), "javascript:..." and absolute URLs all fall back to "/".
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const base = "http://same.invalid";
    const u = new URL(next, base);
    return u.origin === base ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}

/** A 1-based page number from the query string; anything invalid becomes `fallback`. */
export function parsePageParam(raw: string | null, fallback = 1): number {
  if (raw === null || !/^\d{1,6}$/.test(raw)) return fallback;
  const n = Number(raw);
  return n >= 1 ? n : fallback;
}
