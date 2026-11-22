# DocuMind AI — Frontend

Next.js (App Router) web client for DocuMind AI: document library and upload,
page viewer with citation highlights, streaming verified chat, comparison, tables and charts.

**Stack:** Next.js 16 · React 19 · TypeScript (strict) · TanStack Query · Tailwind CSS 4 · zod

The API, agents and data model live in the backend repository (`documind-ai`). This repo talks to it
only over HTTP, through the contract in `documind-ai/docs/api-contracts.md`.

## Quick start

Requires Node 22 and a running backend (see the backend README).

```bash
cp .env.example .env.local   # DOCUMIND_API_URL=http://localhost:8000
npm install
npm run dev                  # http://localhost:3000
```

## Checks (what CI runs)

```bash
npm run check   # eslint (0 warnings) + tsc --noEmit + vitest with coverage thresholds
npm run build   # production build
```

## Architecture

```
browser ──► Next.js BFF (/api/auth/*, /api/proxy/*) ──► FastAPI /api/v1/*
            httpOnly cookies hold the tokens; browser JS never sees them
```

| Path | Responsibility |
|---|---|
| `src/lib/contracts.ts` | zod mirror of the backend's Pydantic response models. **Every** response is validated before the UI uses it. |
| `src/lib/api.ts` | Browser client: network, problem+json and contract errors all become a typed `ApiError`. |
| `src/lib/ask.ts` | Pure state machine for streamed answers (SSE): malformed events, early disconnects and user stops are explicit states. |
| `src/lib/server/` | BFF (server-only): env validation, proxy, session cookies, auth handlers. |
| `src/app/` | Routes, layouts, error boundaries. |
| `src/features/`, `src/components/` | UI. |

### Robustness guarantees

- **Contract validation:** responses that drift from the expected shape fail with a clear message
  instead of crashing a component. Unknown fields are ignored, so additive backend changes are safe.
  Model-generated chart data degrades to "no chart" rather than failing the whole response.
- **Verified answers only:** a `final` event that doesn't match the `Answer` contract is never rendered.
- **BFF failure handling:** backend down → `502`, slow → `504` (timeout applies to response headers
  only, so streams aren't cut), oversized body → `413`, path traversal → `400`, cross-site writes →
  `403`. Every error is RFC 9457 problem+json with an `x-request-id` that is forwarded to the backend
  for log correlation.
- **Token refresh:** the backend treats refresh-token reuse as theft. Concurrent 401s share a single
  refresh, and stragglers still carrying the old cookie reuse its result. A transient backend error
  never signs the user out.
- **Client hygiene:** in-flight requests and polling are cancelled on navigation, the query cache is
  cleared on sign-in and sign-out (no data bleeding between accounts), 4xx responses aren't retried,
  and post-login redirects are restricted to same-origin paths.

### Configuration

All server-side and validated at first use (`src/lib/server/env.ts`); see `.env.example`.

| Variable | Default | |
|---|---|---|
| `DOCUMIND_API_URL` | `http://localhost:8000` | **Required** in production |
| `DOCUMIND_UPSTREAM_TIMEOUT_MS` | `30000` | Max wait for backend response headers |
| `DOCUMIND_MAX_BODY_BYTES` | 51 MB | Max request body the BFF buffers |

### Production

`next.config.ts` uses `output: "standalone"`. Run the build with `node .next/standalone/server.js`
(copy `.next/static` alongside it), not `next start`.

## Local setup on iCloud-synced folders

The repo sits under `~/Documents`, which iCloud syncs. Heavy, regenerable directories use the `.nosync`
suffix (iCloud skips it) behind a symlink:

```bash
mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules
mkdir -p .next.nosync && ln -sfn .next.nosync .next
```

`npm install` replaces the `node_modules` symlink with a real directory, so re-run the first line
after installing. In this layout `next build` prints warnings about `@opentelemetry/api`. They're
harmless (Next's optional, try/catch-wrapped requires) and don't appear in a regular checkout or in CI.
