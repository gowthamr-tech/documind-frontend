// Server-only configuration, validated once on first use (the frontend's pydantic-settings).
// Read lazily so `next build` does not need runtime secrets; misconfiguration fails the first
// request loudly instead of silently pointing at the wrong backend.
import { z } from "zod";

const MB = 1024 * 1024;

const Schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Base URL of the FastAPI backend, without /api/v1. Required in production. */
    DOCUMIND_API_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Max time to wait for the backend's response headers (streams may run longer). */
    DOCUMIND_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
    /** Max request body the BFF will buffer; backend upload limit is 50 MB plus multipart overhead. */
    DOCUMIND_MAX_BODY_BYTES: z.coerce.number().int().positive().default(51 * MB),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.DOCUMIND_API_URL) {
      ctx.addIssue({ code: "custom", path: ["DOCUMIND_API_URL"], message: "is required in production" });
    }
  });

export interface ServerEnv {
  production: boolean;
  apiUrl: string;
  upstreamTimeoutMs: number;
  maxBodyBytes: number;
}

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const r = Schema.safeParse(source);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid frontend server configuration:\n${lines}`);
  }
  return {
    production: r.data.NODE_ENV === "production",
    apiUrl: (r.data.DOCUMIND_API_URL ?? "http://localhost:8000").replace(/\/+$/, ""),
    upstreamTimeoutMs: r.data.DOCUMIND_UPSTREAM_TIMEOUT_MS,
    maxBodyBytes: r.data.DOCUMIND_MAX_BODY_BYTES,
  };
}

let cached: ServerEnv | undefined;
export function serverEnv(): ServerEnv {
  return (cached ??= parseEnv(process.env));
}

/** Test hook: forget the cached configuration. */
export function resetServerEnv(): void {
  cached = undefined;
}
