// Runtime-validated mirror of the backend's Pydantic contracts (documind-ai: backend/app/schemas,
// docs/api-contracts.md). Every response is parsed with one of these schemas before the UI sees it,
// so contract drift surfaces as a clear error instead of a crash deep inside a component.
//
// Conventions:
// - Unknown keys are stripped (zod default), so additive backend changes are safe.
// - Fields the backend types loosely (dict[str, Any], free-form str) stay loose here, and
//   model-generated payloads (`chart`) fall back to null instead of failing the whole response.
import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string();
const bbox = z.array(z.number()).nullable();
const errorInfo = z
  .object({ stage: z.string().optional(), message: z.string().optional() })
  .loose()
  .nullable();

export const VersionStatus = z.enum(["uploaded", "queued", "processing", "ready", "failed"]);
export const JobStatus = z.enum(["pending", "running", "succeeded", "failed", "skipped"]);
export const Verification = z.enum(["verified", "partial", "unsupported", "unverified"]);
export const Summary = z.enum(["verified", "partially_verified", "insufficient_evidence"]);

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next_cursor: z.string().nullable() });

// --- auth ---------------------------------------------------------------------------------------
export const TokenPair = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
export const Me = z.object({ user_id: id, email: z.string(), org_id: id, org_name: z.string(), role: z.string() });

// --- documents ----------------------------------------------------------------------------------
export const Version = z.object({
  id,
  version_no: z.number().int(),
  sha256: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  original_filename: z.string(),
  page_count: z.number().int().nullable(),
  status: VersionStatus,
  pipeline_version: z.string().nullable(),
  error: errorInfo,
  created_at: timestamp,
});
export const DocumentSummary = z.object({
  id,
  title: z.string(),
  tags: z.array(z.string()),
  sensitivity: z.enum(["normal", "confidential"]),
  classification: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  current_version: Version.nullable(),
});
export const DocumentDetail = DocumentSummary.extend({ versions: z.array(Version) });
export const DocumentPage = pageOf(DocumentSummary);
export const UploadOut = z.object({
  document_id: id,
  version_id: id,
  version_no: z.number().int(),
  status: VersionStatus,
  deduplicated: z.boolean(),
});

export const Stage = z.object({
  stage: z.string(),
  status: JobStatus,
  attempt: z.number().int(),
  started_at: timestamp.nullable(),
  finished_at: timestamp.nullable(),
  metrics: z.record(z.string(), z.unknown()),
  error: errorInfo,
});
export const StatusOut = z.object({
  document_id: id,
  version_id: id,
  status: VersionStatus,
  error: errorInfo,
  stages: z.array(Stage),
});
export const ProcessingJob = Stage.extend({ id, document_version_id: id, created_at: timestamp });
export const ProcessingPage = pageOf(ProcessingJob);

// --- extraction ---------------------------------------------------------------------------------
export const PageInfo = z.object({
  page_no: z.number().int(),
  width: z.number(),
  height: z.number(),
  has_text_layer: z.boolean().nullable(),
  ocr_applied: z.boolean(),
  has_image: z.boolean().default(false),
});
export const ElementInfo = z.object({
  id,
  type: z.string(),
  page_no: z.number().int().nullable(),
  bbox,
  text: z.string(),
  section_path: z.array(z.string()),
});
export const Cell = z.object({
  row_idx: z.number().int(),
  col_idx: z.number().int(),
  row_span: z.number().int().min(1),
  col_span: z.number().int().min(1),
  is_header: z.boolean(),
  header_path: z.array(z.string()),
  row_path: z.array(z.string()),
  raw_text: z.string(),
  numeric_value: z.string().nullable(), // Decimal -> JSON string
  unit: z.string().nullable(),
  scale: z.number().nullable(),
});
export const TableInfo = z.object({
  id,
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  bbox,
  caption: z.string().nullable(),
  footnotes: z.array(z.string()),
  units: z.string().nullable(),
  header_depth: z.number().int(),
  n_rows: z.number().int().min(0),
  n_cols: z.number().int().min(0),
  section_path: z.array(z.string()),
  markdown: z.string(),
  stitched_from: z.number().int(),
  cells: z.array(Cell).default([]),
});

// `chart` is produced by a vision model and typed dict[str, Any] by the backend: tolerate gaps.
const ChartPoint = z.object({
  x: z.coerce.string(),
  y: z.number().nullable().catch(null),
  value_label_visible: z.boolean().catch(false),
});
const Chart = z.object({
  chart_type: z.string().catch("unknown"),
  title: z.string().nullable().catch(null),
  series: z.array(z.object({ name: z.coerce.string(), points: z.array(ChartPoint).catch([]) })).catch([]),
  trends: z.array(z.string()).catch([]),
});
export const FigureInfo = z.object({
  id,
  page_no: z.number().int().nullable(),
  bbox,
  figure_type: z.string(),
  classifier_label: z.string().nullable(),
  classifier_confidence: z.number().nullable(),
  caption: z.string().nullable(),
  section_path: z.array(z.string()),
  analysis_status: z.string(), // backend: free-form str (pending | succeeded | failed | skipped today)
  description: z.string().nullable(),
  chart: Chart.nullable().catch(null),
  values_are_estimated: z.boolean(),
  validation: z
    .object({
      points_total: z.number().optional(),
      points_verified: z.number().optional(),
      ocr_available: z.boolean().optional(),
    })
    .loose()
    .nullable()
    .catch(null),
  model: z.string().nullable(),
  error: z.string().nullable(),
  has_image: z.boolean().default(false),
});

// --- query / agents -----------------------------------------------------------------------------
export const Citation = z.object({
  citation_id: z.string(),
  chunk_id: id,
  document_id: id,
  version_id: id,
  document_title: z.string(),
  page: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  section: z.array(z.string()),
  bbox,
  bbox_page: z.number().int().nullable(),
  chunk_type: z.string(),
  quote: z.string(),
  quote_is_verbatim: z.boolean(),
  verification: Verification,
});
export const ClaimCheck = z.object({
  text: z.string(),
  citation_ids: z.array(z.string()),
  status: z.enum(["verified", "partial", "unsupported"]),
  invalid_citations: z.array(z.string()).default([]),
  ungrounded_numbers: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export const Computation = z.object({ display: z.string(), expression: z.string(), estimated: z.boolean() });
export const Answer = z.object({
  answer_markdown: z.string(),
  claims: z.array(ClaimCheck),
  citations: z.array(Citation),
  computations: z.record(z.string(), Computation),
  verification_summary: Summary,
  limitations: z.array(z.string()),
  route: z.array(z.string()),
  conversation_id: id,
  run_id: id,
  message_id: id.optional(),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      cost_usd: z.string().nullable(),
      latency_ms: z.number(),
    })
    .optional(),
});
export const PendingApproval = z.object({ status: z.literal("awaiting_approval"), approval_id: id, run_id: id });
export const QueryRun = z.object({
  id,
  question: z.string(),
  status: z.string(),
  verification_summary: Summary.nullable(),
  latency_ms: z.number().nullable(),
  created_at: timestamp,
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
});

// --- evaluation ---------------------------------------------------------------------------------
export const EvalRun = z.object({
  id,
  experiment: z.string(),
  started_at: timestamp,
  git: z.string(),
  dataset: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()),
  summary: z.object({
    headline: z.record(z.string(), z.number()).optional(),
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

export const TableList = z.array(TableInfo);
export const FigureList = z.array(FigureInfo);
export const PageList = z.array(PageInfo);
export const ElementList = z.array(ElementInfo);
export const QueryRunList = z.array(QueryRun);
export const EvalRunList = z.array(EvalRun);

export type VersionStatus = z.infer<typeof VersionStatus>;
export type JobStatus = z.infer<typeof JobStatus>;
export type Verification = z.infer<typeof Verification>;
export type Summary = z.infer<typeof Summary>;
export type TokenPair = z.infer<typeof TokenPair>;
export type Me = z.infer<typeof Me>;
export type Version = z.infer<typeof Version>;
export type DocumentSummary = z.infer<typeof DocumentSummary>;
export type DocumentDetail = z.infer<typeof DocumentDetail>;
export type UploadOut = z.infer<typeof UploadOut>;
export type Stage = z.infer<typeof Stage>;
export type StatusOut = z.infer<typeof StatusOut>;
export type ProcessingJob = z.infer<typeof ProcessingJob>;
export type PageInfo = z.infer<typeof PageInfo>;
export type ElementInfo = z.infer<typeof ElementInfo>;
export type Cell = z.infer<typeof Cell>;
export type TableInfo = z.infer<typeof TableInfo>;
export type FigureInfo = z.infer<typeof FigureInfo>;
export type Citation = z.infer<typeof Citation>;
export type ClaimCheck = z.infer<typeof ClaimCheck>;
export type Answer = z.infer<typeof Answer>;
export type PendingApproval = z.infer<typeof PendingApproval>;
export type QueryRun = z.infer<typeof QueryRun>;
export type EvalRun = z.infer<typeof EvalRun>;
